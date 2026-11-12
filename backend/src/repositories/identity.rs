use sqlx::PgPool;
use uuid::Uuid;

pub async fn create_user(
    pool: &PgPool,
    email: &str,
    password_hash: &str,
    recovery_email: Option<&str>,
) -> Result<Uuid, sqlx::Error> {
    sqlx::query_scalar(
        "INSERT INTO users (email, email_normalized, password_hash, recovery_email)
         VALUES ($1, $1, $2, $3)
         RETURNING id",
    )
    .bind(email)
    .bind(password_hash)
    .bind(recovery_email)
    .fetch_one(pool)
    .await
}

pub async fn find_user(pool: &PgPool, email: &str) -> Result<Option<(Uuid, String)>, sqlx::Error> {
    sqlx::query_as("SELECT id, password_hash FROM users WHERE email_normalized = $1")
        .bind(email)
        .fetch_optional(pool)
        .await
}

pub async fn create_session(
    pool: &PgPool,
    user_id: Uuid,
    token_hash: &[u8],
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + (30 * interval '1 day'))",
    )
    .bind(user_id)
    .bind(token_hash)
    .execute(pool)
    .await
    .map(|_| ())
}

pub async fn revoke_session(pool: &PgPool, token_hash: &[u8]) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE sessions
         SET revoked_at = now()
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
    )
    .bind(token_hash)
    .execute(pool)
    .await
    .map(|_| ())
}

pub async fn find_user_by_session(
    pool: &PgPool,
    token_hash: &[u8],
) -> Result<Option<(Uuid, String)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT users.id, users.email
     FROM users
     INNER JOIN sessions ON sessions.user_id = users.id
     WHERE sessions.token_hash = $1
       AND sessions.revoked_at IS NULL
       AND sessions.expires_at > now()",
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await
}

pub async fn find_session(
    pool: &PgPool,
    token_hash: &[u8],
) -> Result<Option<(Uuid, Uuid)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT user_id, id
         FROM sessions
         WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await
}

pub async fn list_sessions(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Vec<(Uuid, String, String)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT id, created_at::text, expires_at::text
         FROM sessions
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn revoke_session_by_id(
    pool: &PgPool,
    user_id: Uuid,
    session_id: Uuid,
) -> Result<bool, sqlx::Error> {
    Ok(sqlx::query(
        "UPDATE sessions SET revoked_at = now()
         WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()",
    )
    .bind(session_id)
    .bind(user_id)
    .execute(pool)
    .await?
    .rows_affected()
        == 1)
}

pub async fn revoke_other_sessions(
    pool: &PgPool,
    user_id: Uuid,
    current_session_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE sessions SET revoked_at = now()
         WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL AND expires_at > now()",
    )
    .bind(user_id)
    .bind(current_session_id)
    .execute(pool)
    .await
    .map(|_| ())
}

pub async fn list_users(
    pool: &PgPool,
) -> Result<Vec<(Uuid, String, Option<String>, String)>, sqlx::Error> {
    sqlx::query_as("SELECT id, email, recovery_email, created_at::text FROM users ORDER BY created_at")
        .fetch_all(pool)
        .await
}

pub async fn find_profile(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<(Option<String>, Option<String>), sqlx::Error> {
    sqlx::query_as("SELECT display_name, avatar FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(pool)
        .await
}

pub async fn update_profile(
    pool: &PgPool,
    user_id: Uuid,
    display_name: Option<&str>,
    avatar: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET display_name = $2, avatar = $3, updated_at = now() WHERE id = $1")
        .bind(user_id)
        .bind(display_name)
        .bind(avatar)
        .execute(pool)
        .await
        .map(|_| ())
}

pub async fn find_password_hash(pool: &PgPool, user_id: Uuid) -> Result<String, sqlx::Error> {
    sqlx::query_scalar("SELECT password_hash FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(pool)
        .await
}

pub async fn update_email(pool: &PgPool, user_id: Uuid, email: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE users SET email = $2, email_normalized = $2, email_verified_at = NULL, updated_at = now() WHERE id = $1",
    )
    .bind(user_id)
    .bind(email)
    .execute(pool)
    .await
    .map(|_| ())
}

pub async fn update_password(
    pool: &PgPool,
    user_id: Uuid,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1")
        .bind(user_id)
        .bind(password_hash)
        .execute(pool)
        .await
        .map(|_| ())
}
