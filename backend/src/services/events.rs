use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::events::{CreateEvent, Event},
    error::AppError,
    repositories::events,
};

pub async fn list(pool: &PgPool, owner_id: Uuid) -> Result<Vec<Event>, AppError> {
    events::list(pool, owner_id).await.map_err(internal)
}

pub async fn create(pool: &PgPool, owner_id: Uuid, input: CreateEvent) -> Result<Event, AppError> {
    if input.title.trim().is_empty()
        || input.title.chars().count() > 200
        || input.description.chars().count() > 10_000
        || !valid_date(&input.date)
        || !valid_time(&input.start_time)
        || input
            .end_time
            .as_ref()
            .is_some_and(|time| !valid_time(time))
    {
        return Err(AppError::InvalidInput);
    }
    events::create(pool, owner_id, &input)
        .await
        .map_err(internal)
}

fn valid_date(value: &str) -> bool {
    let parts: Vec<_> = value.split('-').collect();
    parts.len() == 3
        && parts[0].len() == 4
        && parts[1]
            .parse::<u8>()
            .is_ok_and(|month| (1..=12).contains(&month))
        && parts[2]
            .parse::<u8>()
            .is_ok_and(|day| (1..=31).contains(&day))
}

fn valid_time(value: &str) -> bool {
    let parts: Vec<_> = value.split(':').collect();
    parts.len() == 2
        && parts[0].parse::<u8>().is_ok_and(|hour| hour < 24)
        && parts[1].parse::<u8>().is_ok_and(|minute| minute < 60)
}

fn internal(error: sqlx::Error) -> AppError {
    tracing::error!(%error, "events repository operation failed");
    AppError::Internal
}
