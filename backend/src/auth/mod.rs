use axum::http::{HeaderMap, header};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{error::AppError, repositories::identity};

pub fn bearer_token(headers: &HeaderMap) -> Result<&str, AppError> {
    let value = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .ok_or(AppError::InvalidCredentials)?;

    value
        .strip_prefix("Bearer ")
        .filter(|token| !token.is_empty() && token.len() <= 256)
        .ok_or(AppError::InvalidCredentials)
}

pub async fn user_from_token(pool: &PgPool, token: &str) -> Result<(Uuid, String), AppError> {
    let token_hash = Sha256::digest(token.as_bytes()).to_vec();
    identity::find_user_by_session(pool, &token_hash)
        .await
        .map_err(|error| {
            tracing::error!(%error, "session lookup failed");
            AppError::Internal
        })?
        .ok_or(AppError::InvalidCredentials)
}

/// `DEV_ADMIN_EMAIL` peut lister plusieurs comptes dev, séparés par des virgules.
pub fn is_dev_admin(email: &str, configured: &str) -> bool {
    configured
        .split(',')
        .any(|dev| email.eq_ignore_ascii_case(dev.trim()))
}

pub fn require_dev_admin(email: &str, configured_email: &str) -> Result<(), AppError> {
    if is_dev_admin(email, configured_email) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

#[cfg(test)]
mod dev_admin_tests {
    use super::is_dev_admin;

    #[test]
    fn accepts_any_listed_dev_account_only() {
        let list = "leo@x.fr, Marie@x.fr";
        assert!(is_dev_admin("leo@x.fr", list));
        assert!(is_dev_admin("marie@x.fr", list));
        assert!(!is_dev_admin("autre@x.fr", list));
        assert!(!is_dev_admin("leo@x.fr", ""));
    }
}
