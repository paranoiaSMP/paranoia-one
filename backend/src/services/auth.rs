use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::auth::{Credentials, SessionResponse},
    error::AppError,
    repositories::identity,
};

const SESSION_DAYS: i64 = 30;

pub async fn register(
    pool: &PgPool,
    credentials: Credentials,
    dev_admin_email: &str,
) -> Result<SessionResponse, AppError> {
    let email = normalize_email(&credentials.email)?;
    if !crate::auth::is_dev_admin(&email, dev_admin_email) {
        return Err(AppError::Forbidden);
    }
    validate_password(&credentials.password)?;
    let password_hash = hash_password(&credentials.password)?;
    let user_id = identity::create_user(pool, &email, &password_hash, None)
        .await
        .map_err(|error| {
            tracing::warn!(%error, "user registration failed");
            AppError::Conflict
        })?;

    create_session(pool, user_id).await
}

/// Outil fermé: seul l'admin crée des comptes, il n'y a pas d'inscription publique.
pub async fn create_account(
    pool: &PgPool,
    account: crate::domain::auth::NewAccount,
) -> Result<crate::domain::auth::UserResponse, AppError> {
    let email = normalize_email(&account.email)?;
    let recovery = normalize_email(&account.recovery_email)?;
    if recovery == email {
        return Err(AppError::InvalidInput);
    }
    validate_password(&account.password)?;
    let password_hash = hash_password(&account.password)?;
    let id = identity::create_user(pool, &email, &password_hash, Some(&recovery))
        .await
        .map_err(|error| {
            tracing::warn!(%error, "account creation failed");
            AppError::Conflict
        })?;
    Ok(crate::domain::auth::UserResponse { id, email, display_name: None, avatar: None, is_admin: false })
}

pub async fn list_accounts(
    pool: &PgPool,
) -> Result<Vec<crate::domain::auth::AccountInfo>, AppError> {
    identity::list_users(pool)
        .await
        .map(|rows| {
            rows.into_iter()
                .map(|(id, email, recovery_email, created_at)| crate::domain::auth::AccountInfo {
                    id,
                    email,
                    recovery_email,
                    created_at,
                })
                .collect()
        })
        .map_err(|error| {
            tracing::error!(%error, "account listing failed");
            AppError::Internal
        })
}

pub async fn current_user(
    pool: &PgPool,
    token: &str,
) -> Result<crate::domain::auth::UserResponse, AppError> {
    let (id, email) = crate::auth::user_from_token(pool, token).await?;
    let (display_name, avatar) = identity::find_profile(pool, id).await.map_err(|error| {
        tracing::error!(%error, "profile lookup failed");
        AppError::Internal
    })?;
    Ok(crate::domain::auth::UserResponse { id, email, display_name, avatar, is_admin: false })
}

pub async fn update_profile(
    pool: &PgPool,
    user_id: Uuid,
    update: crate::domain::auth::ProfileUpdate,
) -> Result<(), AppError> {
    let name = update.display_name.as_deref().map(str::trim).filter(|n| !n.is_empty());
    if name.is_some_and(|n| n.chars().count() > 40) {
        return Err(AppError::InvalidInput);
    }
    let avatar = update.avatar.as_deref().filter(|a| !a.is_empty());
    if avatar.is_some_and(|a| !a.starts_with("data:image/") || a.len() > 200_000) {
        return Err(AppError::InvalidInput);
    }
    identity::update_profile(pool, user_id, name, avatar)
        .await
        .map_err(|error| {
            tracing::error!(%error, "profile update failed");
            AppError::Internal
        })
}

async fn confirm_password(pool: &PgPool, user_id: Uuid, password: &str) -> Result<(), AppError> {
    let hash = identity::find_password_hash(pool, user_id).await.map_err(|error| {
        tracing::error!(%error, "password lookup failed");
        AppError::Internal
    })?;
    verify_password(password, &hash)
}

/// Le compte dev reste lié à `DEV_ADMIN_EMAIL`: changer son email lui ferait perdre ses droits.
pub async fn change_email(
    pool: &PgPool,
    user_id: Uuid,
    current_email: &str,
    dev_admin_email: &str,
    change: crate::domain::auth::EmailChange,
) -> Result<(), AppError> {
    confirm_password(pool, user_id, &change.password).await?;
    if crate::auth::is_dev_admin(current_email, dev_admin_email) {
        return Err(AppError::Forbidden);
    }
    let email = normalize_email(&change.email)?;
    identity::update_email(pool, user_id, &email)
        .await
        .map_err(|error| {
            tracing::warn!(%error, "email change failed");
            AppError::Conflict
        })
}

pub async fn change_password(
    pool: &PgPool,
    user_id: Uuid,
    token: &str,
    change: crate::domain::auth::PasswordChange,
) -> Result<(), AppError> {
    confirm_password(pool, user_id, &change.current).await?;
    validate_password(&change.new)?;
    let hash = hash_password(&change.new)?;
    identity::update_password(pool, user_id, &hash)
        .await
        .map_err(|error| {
            tracing::error!(%error, "password change failed");
            AppError::Internal
        })?;
    revoke_other_sessions(pool, user_id, token).await
}

pub async fn login(pool: &PgPool, credentials: Credentials) -> Result<SessionResponse, AppError> {
    let email = normalize_email(&credentials.email)?;
    let row = identity::find_user(pool, &email).await.map_err(|error| {
        tracing::error!(%error, "login lookup failed");
        AppError::Internal
    })?;
    let Some((user_id, password_hash)) = row else {
        return Err(AppError::InvalidCredentials);
    };

    verify_password(&credentials.password, &password_hash)?;
    create_session(pool, user_id).await
}

pub async fn logout(pool: &PgPool, token: &str) -> Result<(), AppError> {
    let token_hash = Sha256::digest(token.as_bytes()).to_vec();
    identity::revoke_session(pool, &token_hash)
        .await
        .map_err(|error| {
            tracing::error!(%error, "session revocation failed");
            AppError::Internal
        })
}

pub async fn sessions(
    pool: &PgPool,
    user_id: Uuid,
    current_token: &str,
) -> Result<Vec<crate::domain::auth::SessionInfo>, AppError> {
    let current_id = current_session_id(pool, current_token).await?;
    identity::list_sessions(pool, user_id)
        .await
        .map(|items| {
            items
                .into_iter()
                .map(
                    |(id, created_at, expires_at)| crate::domain::auth::SessionInfo {
                        current: id == current_id,
                        id,
                        created_at,
                        expires_at,
                    },
                )
                .collect()
        })
        .map_err(|error| {
            tracing::error!(%error, "session listing failed");
            AppError::Internal
        })
}

pub async fn revoke_session(
    pool: &PgPool,
    user_id: Uuid,
    session_id: Uuid,
) -> Result<(), AppError> {
    if identity::revoke_session_by_id(pool, user_id, session_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "session revocation failed");
            AppError::Internal
        })?
    {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

pub async fn revoke_other_sessions(
    pool: &PgPool,
    user_id: Uuid,
    current_token: &str,
) -> Result<(), AppError> {
    let current_id = current_session_id(pool, current_token).await?;
    identity::revoke_other_sessions(pool, user_id, current_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "other session revocation failed");
            AppError::Internal
        })
}

async fn current_session_id(pool: &PgPool, token: &str) -> Result<Uuid, AppError> {
    let token_hash = Sha256::digest(token.as_bytes()).to_vec();
    identity::find_session(pool, &token_hash)
        .await
        .map_err(|error| {
            tracing::error!(%error, "current session lookup failed");
            AppError::Internal
        })?
        .map(|(_, session_id)| session_id)
        .ok_or(AppError::InvalidCredentials)
}

fn normalize_email(email: &str) -> Result<String, AppError> {
    let normalized = email.trim().to_ascii_lowercase();
    if normalized.len() < 3 || normalized.len() > 320 || !normalized.contains('@') {
        return Err(AppError::InvalidInput);
    }
    Ok(normalized)
}

fn validate_password(password: &str) -> Result<(), AppError> {
    if !(12..=128).contains(&password.chars().count()) {
        return Err(AppError::InvalidInput);
    }
    Ok(())
}

fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| AppError::Internal)
}

fn verify_password(password: &str, hash: &str) -> Result<(), AppError> {
    let parsed = PasswordHash::new(hash).map_err(|_| AppError::InvalidCredentials)?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| AppError::InvalidCredentials)
}

async fn create_session(pool: &PgPool, user_id: Uuid) -> Result<SessionResponse, AppError> {
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let token = URL_SAFE_NO_PAD.encode(bytes);
    let token_hash = Sha256::digest(token.as_bytes()).to_vec();

    identity::create_session(pool, user_id, &token_hash)
        .await
        .map_err(|error| {
            tracing::error!(%error, "session creation failed");
            AppError::Internal
        })?;

    Ok(SessionResponse {
        token,
        expires_in: (SESSION_DAYS * 86_400) as u32,
    })
}

#[cfg(test)]
mod tests {
    use super::{hash_password, verify_password};

    #[test]
    fn password_hash_verifies_only_original_password() {
        let hash = hash_password("correct horse battery staple").expect("hashing should work");

        assert!(verify_password("correct horse battery staple", &hash).is_ok());
        assert!(verify_password("wrong password", &hash).is_err());
    }
}
