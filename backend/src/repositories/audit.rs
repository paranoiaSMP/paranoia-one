use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::audit::{AuditEntry, Install};

pub async fn record(
    pool: &PgPool,
    actor_id: Option<Uuid>,
    actor: &str,
    action: &str,
    target: &str,
    ip: Option<&str>,
    detail: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO audit_log (actor_id, actor, action, target, ip, detail)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(actor_id)
    .bind(actor)
    .bind(action)
    .bind(target)
    .bind(ip)
    .bind(detail)
    .execute(pool)
    .await
    .map(|_| ())
}

type AuditRow = (i64, String, Option<Uuid>, String, String, String, Option<String>, String);

pub async fn list(
    pool: &PgPool,
    limit: i64,
    before: Option<i64>,
    action_prefix: &str,
) -> Result<Vec<AuditEntry>, sqlx::Error> {
    let rows: Vec<AuditRow> = sqlx::query_as(
        "SELECT id, at::text, actor_id, actor, action, target, ip, detail
         FROM audit_log
         WHERE ($1::bigint IS NULL OR id < $1) AND starts_with(action, $2)
         ORDER BY id DESC LIMIT $3",
    )
    .bind(before)
    .bind(action_prefix)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, at, actor_id, actor, action, target, ip, detail)| AuditEntry { id, at, actor_id, actor, action, target, ip, detail })
        .collect())
}

type InstallRow = (Uuid, String, String, Option<String>, Option<String>, Option<String>, Option<String>, String);
const INSTALL_COLUMNS: &str = "id, label, status, version, binary_hash, last_seen::text, last_ip, created_at::text";

fn install(row: InstallRow) -> Install {
    let (id, label, status, version, binary_hash, last_seen, last_ip, created_at) = row;
    Install { id, label, status, version, binary_hash, last_seen, last_ip, created_at }
}

pub async fn create_install(pool: &PgPool, label: &str, token_hash: &[u8]) -> Result<Install, sqlx::Error> {
    sqlx::query_as(&format!("INSERT INTO launcher_installs (label, token_hash) VALUES ($1, $2) RETURNING {INSTALL_COLUMNS}"))
        .bind(label)
        .bind(token_hash)
        .fetch_one(pool)
        .await
        .map(install)
}

pub async fn list_installs(pool: &PgPool) -> Result<Vec<Install>, sqlx::Error> {
    let rows: Vec<InstallRow> = sqlx::query_as(&format!("SELECT {INSTALL_COLUMNS} FROM launcher_installs ORDER BY created_at DESC"))
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(install).collect())
}

/// Passe `id` de l'un des statuts `from` à `to`. `None` si l'installation n'existe pas, `Some(false)` si le statut ne permet pas la transition.
pub async fn transition(pool: &PgPool, id: Uuid, from: &[&str], to: &str) -> Result<Option<(bool, Install)>, sqlx::Error> {
    let from: Vec<String> = from.iter().map(|s| (*s).to_owned()).collect();
    let updated: Option<InstallRow> = sqlx::query_as(&format!(
        "UPDATE launcher_installs SET status = $3 WHERE id = $1 AND status = ANY($2) RETURNING {INSTALL_COLUMNS}"
    ))
    .bind(id)
    .bind(&from)
    .bind(to)
    .fetch_optional(pool)
    .await?;
    if let Some(row) = updated {
        return Ok(Some((true, install(row))));
    }
    let current: Option<InstallRow> = sqlx::query_as(&format!("SELECT {INSTALL_COLUMNS} FROM launcher_installs WHERE id = $1"))
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(current.map(|row| (false, install(row))))
}

pub async fn find_install_by_token(pool: &PgPool, token_hash: &[u8]) -> Result<Option<Install>, sqlx::Error> {
    let row: Option<InstallRow> = sqlx::query_as(&format!("SELECT {INSTALL_COLUMNS} FROM launcher_installs WHERE token_hash = $1"))
        .bind(token_hash)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(install))
}

pub async fn touch_install(
    pool: &PgPool,
    id: Uuid,
    version: Option<&str>,
    binary_hash: Option<&str>,
    ip: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE launcher_installs
         SET last_seen = now(), last_ip = $2, version = COALESCE($3, version), binary_hash = COALESCE($4, binary_hash)
         WHERE id = $1",
    )
    .bind(id)
    .bind(ip)
    .bind(version)
    .bind(binary_hash)
    .execute(pool)
    .await
    .map(|_| ())
}

/// L'audit ne doit jamais faire échouer l'action qu'il décrit: une erreur d'écriture est seulement journalisée.
pub async fn record_lossy(pool: &PgPool, actor_id: Option<Uuid>, actor: &str, action: &str, target: &str, ip: Option<&str>, detail: &str) {
    let cut = |s: &str, n: usize| s.chars().take(n).collect::<String>();
    if let Err(error) = record(pool, actor_id, &cut(actor, 320), action, &cut(target, 200), ip.map(|i| cut(i, 64)).as_deref(), &cut(detail, 500)).await {
        tracing::error!(%error, action, "audit write failed");
    }
}
