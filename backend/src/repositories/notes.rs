use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::{
    notes::{CreateNote, Note, UpdateNote},
    pagination::{Page, PageQuery, cursor},
};

pub async fn list(
    pool: &PgPool,
    owner_id: Uuid,
    query: &PageQuery,
) -> Result<Page<Note>, sqlx::Error> {
    let limit = query.limit().expect("validated page limit");
    let offset = query.offset().expect("validated page cursor");
    let search = query.search();
    let items = sqlx::query_as::<_, (Uuid, String, String, String, String)>(
        "SELECT id, title, content, created_at::text, updated_at::text
         FROM notes
         WHERE owner_id = $1
           AND ($2::text IS NULL OR title ILIKE '%' || $2 || '%' OR content ILIKE '%' || $2 || '%')
         ORDER BY updated_at DESC, id DESC
         LIMIT $3 OFFSET $4",
    )
    .bind(owner_id)
    .bind(search)
    .bind(limit + 1)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    let mut notes = rows(items);
    let has_more = notes.len() > limit as usize;
    if has_more {
        notes.pop();
    }
    Ok(Page {
        items: notes,
        next_cursor: has_more.then(|| cursor(offset + limit)),
    })
}

pub async fn create(
    pool: &PgPool,
    owner_id: Uuid,
    input: &CreateNote,
) -> Result<Note, sqlx::Error> {
    sqlx::query_as::<_, (Uuid, String, String, String, String)>(
        "INSERT INTO notes (owner_id, title, content)
         VALUES ($1, $2, $3)
         RETURNING id, title, content, created_at::text, updated_at::text",
    )
    .bind(owner_id)
    .bind(&input.title)
    .bind(&input.content)
    .fetch_one(pool)
    .await
    .map(row)
}

pub async fn update(
    pool: &PgPool,
    owner_id: Uuid,
    note_id: Uuid,
    input: &UpdateNote,
) -> Result<Option<Note>, sqlx::Error> {
    sqlx::query_as::<_, (Uuid, String, String, String, String)>(
        "UPDATE notes SET title = $1, content = $2, updated_at = now()
         WHERE id = $3 AND owner_id = $4
         RETURNING id, title, content, created_at::text, updated_at::text",
    )
    .bind(&input.title)
    .bind(&input.content)
    .bind(note_id)
    .bind(owner_id)
    .fetch_optional(pool)
    .await
    .map(|result| result.map(row))
}

pub async fn delete(pool: &PgPool, owner_id: Uuid, note_id: Uuid) -> Result<bool, sqlx::Error> {
    sqlx::query("DELETE FROM notes WHERE id = $1 AND owner_id = $2")
        .bind(note_id)
        .bind(owner_id)
        .execute(pool)
        .await
        .map(|result| result.rows_affected() == 1)
}

fn row(value: (Uuid, String, String, String, String)) -> Note {
    Note {
        id: value.0,
        title: value.1,
        content: value.2,
        created_at: value.3,
        updated_at: value.4,
    }
}

fn rows(values: Vec<(Uuid, String, String, String, String)>) -> Vec<Note> {
    values.into_iter().map(row).collect()
}
