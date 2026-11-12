use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::audit::{Checkin, Incident, Install, InstallOrder, NewInstall},
    error::AppError,
    repositories::audit,
};

const INCIDENT_KINDS: [&str; 3] = ["extraction_attempt", "tamper", "hash_mismatch"];

fn internal(error: sqlx::Error) -> AppError {
    tracing::error!(%error, "launcher query failed");
    AppError::Internal
}

pub async fn create(pool: &PgPool, label: &str, actor: (Uuid, &str), ip: Option<&str>) -> Result<NewInstall, AppError> {
    let label = label.trim();
    if label.is_empty() || label.chars().count() > 80 {
        return Err(AppError::InvalidInput);
    }
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let token = format!("pl_{}", URL_SAFE_NO_PAD.encode(bytes));
    let install = audit::create_install(pool, label, &Sha256::digest(token.as_bytes())).await.map_err(internal)?;
    audit::record_lossy(pool, Some(actor.0), actor.1, "launcher.install_created", &install.id.to_string(), ip, label).await;
    Ok(NewInstall { install, token })
}

pub async fn list(pool: &PgPool) -> Result<Vec<Install>, AppError> {
    audit::list_installs(pool).await.map_err(internal)
}

#[derive(Clone, Copy)]
pub enum Op {
    Revoke,
    Reactivate,
    DeleteOrder,
}

/// Le garde-fou « révoquer d'abord » est ici: un ordre de suppression n'est accepté que pour une installation déjà révoquée.
pub async fn admin_order(pool: &PgPool, id: Uuid, op: Op, actor: (Uuid, &str), ip: Option<&str>) -> Result<Install, AppError> {
    let (from, to, action): (&[&str], &str, &str) = match op {
        Op::Revoke => (&["actif"], "revoque", "launcher.revoked"),
        Op::Reactivate => (&["revoque"], "actif", "launcher.reactivated"),
        Op::DeleteOrder => (&["revoque"], "a_supprimer", "launcher.delete_ordered"),
    };
    match audit::transition(pool, id, from, to).await.map_err(internal)? {
        None => Err(AppError::NotFound),
        Some((false, _)) => Err(AppError::Conflict),
        Some((true, install)) => {
            audit::record_lossy(pool, Some(actor.0), actor.1, action, &id.to_string(), ip, &install.label).await;
            Ok(install)
        }
    }
}

async fn install_for(pool: &PgPool, token: &str) -> Result<Install, AppError> {
    audit::find_install_by_token(pool, &Sha256::digest(token.as_bytes()))
        .await
        .map_err(internal)?
        .ok_or(AppError::InvalidCredentials)
}

pub async fn checkin(pool: &PgPool, token: &str, ip: Option<&str>, input: Checkin) -> Result<InstallOrder, AppError> {
    let install = install_for(pool, token).await?;
    let version = input.version.as_deref().filter(|v| !v.is_empty());
    let hash = input.binary_hash.as_deref().filter(|h| !h.is_empty());
    if version.is_some_and(|v| v.chars().count() > 40) || hash.is_some_and(|h| h.chars().count() > 128) {
        return Err(AppError::InvalidInput);
    }
    let who = format!("launcher:{}", install.label);
    if let (Some(old), Some(new)) = (install.binary_hash.as_deref(), hash)
        && old != new
    {
        audit::record_lossy(pool, None, &who, "launcher.hash_changed", &install.id.to_string(), ip, &format!("{old} -> {new}")).await;
    }
    audit::touch_install(pool, install.id, version, hash, ip).await.map_err(internal)?;
    Ok(InstallOrder { status: install.status })
}

/// Un incident coupe uniquement le launcher (statut révoqué). La suppression reste un ordre explicite de l'admin.
pub async fn incident(pool: &PgPool, token: &str, ip: Option<&str>, input: Incident) -> Result<InstallOrder, AppError> {
    let install = install_for(pool, token).await?;
    if !INCIDENT_KINDS.contains(&input.kind.as_str()) {
        return Err(AppError::InvalidInput);
    }
    let who = format!("launcher:{}", install.label);
    let id = install.id.to_string();
    let detail = format!("{} {}", input.kind, input.detail.unwrap_or_default());
    audit::record_lossy(pool, None, &who, "launcher.incident", &id, ip, detail.trim()).await;
    let status = match audit::transition(pool, install.id, &["actif"], "revoque").await.map_err(internal)? {
        Some((true, _)) => {
            audit::record_lossy(pool, None, &who, "launcher.revoked_auto", &id, ip, &input.kind).await;
            "revoque".to_owned()
        }
        _ => install.status,
    };
    Ok(InstallOrder { status })
}

/// Le launcher confirme qu'il a supprimé ses propres fichiers (sur ordre ou après une tentative d'extraction).
pub async fn deleted(pool: &PgPool, token: &str, ip: Option<&str>) -> Result<InstallOrder, AppError> {
    let install = install_for(pool, token).await?;
    audit::transition(pool, install.id, &["actif", "revoque", "a_supprimer"], "supprime").await.map_err(internal)?;
    audit::record_lossy(pool, None, &format!("launcher:{}", install.label), "launcher.deleted", &install.id.to_string(), ip, &format!("était {}", install.status)).await;
    Ok(InstallOrder { status: "supprime".to_owned() })
}
