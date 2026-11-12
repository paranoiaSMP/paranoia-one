use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::collab::{Comment, Member, Notification};

type CommentRow = (Uuid, String, String, String, bool);
const NAME: &str = "COALESCE(u.display_name, split_part(u.email, '@', 1))";

fn comment(r: CommentRow) -> Comment {
    Comment { id: r.0, author: r.1, body: r.2, created_at: r.3, mine: r.4 }
}

pub async fn list_comments(pool: &PgPool, task_id: Uuid, viewer: Uuid) -> Result<Vec<Comment>, sqlx::Error> {
    sqlx::query_as::<_, CommentRow>(&format!(
        "SELECT c.id, {NAME}, c.body, to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), c.author_id = $2
         FROM task_comments c JOIN users u ON u.id = c.author_id
         WHERE c.task_id = $1 ORDER BY c.created_at, c.id LIMIT 200"
    ))
    .bind(task_id)
    .bind(viewer)
    .fetch_all(pool)
    .await
    .map(|rows| rows.into_iter().map(comment).collect())
}

pub async fn add_comment(pool: &PgPool, task_id: Uuid, author: Uuid, body: &str) -> Result<Comment, sqlx::Error> {
    sqlx::query_as::<_, CommentRow>(&format!(
        "WITH c AS (INSERT INTO task_comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING *)
         SELECT c.id, {NAME}, c.body, to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), true FROM c JOIN users u ON u.id = c.author_id"
    ))
    .bind(task_id)
    .bind(author)
    .bind(body)
    .fetch_one(pool)
    .await
    .map(comment)
}

/// `(task_id, author_id)` du commentaire.
pub async fn find_comment(pool: &PgPool, id: Uuid) -> Result<Option<(Uuid, Uuid)>, sqlx::Error> {
    sqlx::query_as("SELECT task_id, author_id FROM task_comments WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn delete_comment(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM task_comments WHERE id = $1").bind(id).execute(pool).await.map(|_| ())
}

pub async fn display_name(pool: &PgPool, user_id: Uuid) -> Result<String, sqlx::Error> {
    sqlx::query_scalar(&format!("SELECT {NAME} FROM users u WHERE u.id = $1")).bind(user_id).fetch_one(pool).await
}

/// Une notification ne doit jamais faire échouer l'action qui la déclenche.
pub async fn notify(pool: &PgPool, user_id: Uuid, kind: &str, text: &str, link: &str) {
    let text: String = text.chars().take(300).collect();
    if let Err(error) = sqlx::query("INSERT INTO notifications (user_id, kind, text, link) VALUES ($1, $2, $3, $4)")
        .bind(user_id)
        .bind(kind)
        .bind(text)
        .bind(link)
        .execute(pool)
        .await
    {
        tracing::error!(%error, kind, "notification write failed");
    }
}

/// Prévient la personne invitée si elle a déjà un compte (l'invitation reste valable sinon).
pub async fn notify_invitation(pool: &PgPool, email: &str, inviter: &str, workspace_id: Uuid) {
    if let Err(error) = sqlx::query(
        "INSERT INTO notifications (user_id, kind, text, link)
         SELECT u.id, 'invitation', left($2 || ' t''invite dans l''équipe ' || w.name, 300), 'teams'
         FROM users u, workspaces w WHERE u.email_normalized = lower(trim($1)) AND w.id = $3",
    )
    .bind(email)
    .bind(inviter)
    .bind(workspace_id)
    .execute(pool)
    .await
    {
        tracing::error!(%error, "invitation notification failed");
    }
}

/// Rappelle les événements qui commencent dans les 15 minutes. `now` est l'heure locale du client (les
/// événements n'ont pas de fuseau). `reminded_at` fait de l'UPDATE le verrou: un seul rappel par événement.
pub async fn remind_events(pool: &PgPool, user_id: Uuid, now: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "WITH due AS (
             UPDATE events SET reminded_at = now()
             WHERE owner_id = $1 AND reminded_at IS NULL
               AND event_date + start_time BETWEEN $2::timestamp AND $2::timestamp + interval '15 minutes'
             RETURNING title, to_char(start_time, 'HH24:MI') AS at
         )
         INSERT INTO notifications (user_id, kind, text, link)
         SELECT $1, 'reminder', 'Rappel · « ' || title || ' » à ' || at, 'calendar' FROM due",
    )
    .bind(user_id)
    .bind(now)
    .execute(pool)
    .await
    .map(|_| ())
}

pub async fn list_notifications(pool: &PgPool, user_id: Uuid) -> Result<(Vec<Notification>, i64), sqlx::Error> {
    let rows = sqlx::query_as::<_, (Uuid, String, String, String, bool, String)>(
        "SELECT id, kind, text, link, read_at IS NOT NULL, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')
         FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 30",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    let unread = sqlx::query_scalar("SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL")
        .bind(user_id)
        .fetch_one(pool)
        .await?;
    let items = rows.into_iter().map(|r| Notification { id: r.0, kind: r.1, text: r.2, link: r.3, read: r.4, created_at: r.5 }).collect();
    Ok((items, unread))
}

pub async fn mark_all_read(pool: &PgPool, user_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL")
        .bind(user_id)
        .execute(pool)
        .await
        .map(|_| ())
}

/// Membres d'une équipe (pour assigner une tâche); vide si `user_id` n'en fait pas partie.
pub async fn members(pool: &PgPool, workspace_id: Uuid, user_id: Uuid) -> Result<Vec<Member>, sqlx::Error> {
    sqlx::query_as::<_, (Uuid, String, String)>(&format!(
        "SELECT u.id, {NAME}, m.role FROM workspace_members m JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = $1
           AND EXISTS (SELECT 1 FROM workspace_members me WHERE me.workspace_id = $1 AND me.user_id = $2)
         ORDER BY m.created_at, u.id"
    ))
    .bind(workspace_id)
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map(|rows| rows.into_iter().map(|r| Member { id: r.0, name: r.1, role: r.2 }).collect())
}
