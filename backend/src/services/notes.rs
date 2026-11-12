use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::{
        notes::{CreateNote, Note, UpdateNote},
        pagination::{Page, PageQuery},
    },
    error::AppError,
    repositories::notes,
};

pub async fn list(
    pool: &PgPool,
    owner_id: Uuid,
    query: &PageQuery,
) -> Result<Page<Note>, AppError> {
    query.limit().map_err(|_| AppError::InvalidInput)?;
    query.offset().map_err(|_| AppError::InvalidInput)?;
    notes::list(pool, owner_id, query).await.map_err(internal)
}

pub async fn create(pool: &PgPool, owner_id: Uuid, input: CreateNote) -> Result<Note, AppError> {
    validate(&input.title, &input.content)?;
    notes::create(pool, owner_id, &input)
        .await
        .map_err(internal)
}

pub async fn update(
    pool: &PgPool,
    owner_id: Uuid,
    note_id: Uuid,
    input: UpdateNote,
) -> Result<Note, AppError> {
    validate(&input.title, &input.content)?;
    notes::update(pool, owner_id, note_id, &input)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)
}

pub async fn delete(pool: &PgPool, owner_id: Uuid, note_id: Uuid) -> Result<(), AppError> {
    if notes::delete(pool, owner_id, note_id)
        .await
        .map_err(internal)?
    {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

fn validate(title: &str, content: &str) -> Result<(), AppError> {
    if title.trim().is_empty() || title.chars().count() > 200 || content.chars().count() > 100_000 {
        return Err(AppError::InvalidInput);
    }
    Ok(())
}

fn internal(error: sqlx::Error) -> AppError {
    tracing::error!(%error, "notes repository operation failed");
    AppError::Internal
}
