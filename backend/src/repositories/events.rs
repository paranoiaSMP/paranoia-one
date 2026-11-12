use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::events::{CreateEvent, Event};

type EventRow = (Uuid, String, String, String, Option<String>, String);

pub async fn list(pool: &PgPool, owner_id: Uuid) -> Result<Vec<Event>, sqlx::Error> {
    sqlx::query_as::<_, EventRow>(
        "SELECT id, title, event_date::text, start_time::text, end_time::text, description
         FROM events WHERE owner_id = $1 ORDER BY event_date, start_time, id",
    )
    .bind(owner_id)
    .fetch_all(pool)
    .await
    .map(|rows| rows.into_iter().map(event).collect())
}

pub async fn create(
    pool: &PgPool,
    owner_id: Uuid,
    input: &CreateEvent,
) -> Result<Event, sqlx::Error> {
    sqlx::query_as::<_, EventRow>(
        "INSERT INTO events (owner_id, title, event_date, start_time, end_time, description)
         VALUES ($1, $2, $3::date, $4::time, $5::time, $6)
         RETURNING id, title, event_date::text, start_time::text, end_time::text, description",
    )
    .bind(owner_id)
    .bind(&input.title)
    .bind(&input.date)
    .bind(&input.start_time)
    .bind(&input.end_time)
    .bind(&input.description)
    .fetch_one(pool)
    .await
    .map(event)
}

fn event(row: EventRow) -> Event {
    Event {
        id: row.0,
        title: row.1,
        date: row.2,
        start_time: row.3,
        end_time: row.4,
        description: row.5,
    }
}
