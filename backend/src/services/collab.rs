use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::collab::{Comment, Member, NotificationList},
    error::AppError,
    repositories::{collab, tasks},
};

fn internal(error: sqlx::Error) -> AppError {
    tracing::error!(%error, "collaboration query failed");
    AppError::Internal
}

pub async fn comments(pool: &PgPool, user_id: Uuid, task_id: Uuid) -> Result<Vec<Comment>, AppError> {
    tasks::access(pool, user_id, task_id).await.map_err(internal)?.ok_or(AppError::NotFound)?;
    collab::list_comments(pool, task_id, user_id).await.map_err(internal)
}

pub async fn add_comment(pool: &PgPool, user_id: Uuid, task_id: Uuid, body: &str) -> Result<Comment, AppError> {
    let body = body.trim();
    if body.is_empty() || body.chars().count() > 2000 {
        return Err(AppError::InvalidInput);
    }
    let access = tasks::access(pool, user_id, task_id).await.map_err(internal)?.ok_or(AppError::NotFound)?;
    if !access.can_write {
        return Err(AppError::Forbidden);
    }
    let comment = collab::add_comment(pool, task_id, user_id, body).await.map_err(internal)?;
    let text = format!("{} a commenté « {} »", comment.author, access.title);
    let link = access.workspace_id.map_or("tasks".to_owned(), |w| format!("tasks:{w}"));
    let mut recipients = vec![access.owner_id];
    recipients.extend(access.assignee_id);
    recipients.sort();
    recipients.dedup();
    for to in recipients.into_iter().filter(|to| *to != user_id) {
        collab::notify(pool, to, "comment", &text, &link).await;
    }
    Ok(comment)
}

/// L'auteur supprime son commentaire; un responsable de l'équipe (ou le propriétaire) peut modérer.
pub async fn delete_comment(pool: &PgPool, user_id: Uuid, comment_id: Uuid) -> Result<(), AppError> {
    let (task_id, author) = collab::find_comment(pool, comment_id).await.map_err(internal)?.ok_or(AppError::NotFound)?;
    let access = tasks::access(pool, user_id, task_id).await.map_err(internal)?.ok_or(AppError::NotFound)?;
    if author != user_id && !access.can_delete {
        return Err(AppError::Forbidden);
    }
    collab::delete_comment(pool, comment_id).await.map_err(internal)
}

/// `YYYY-MM-DDTHH:MM`, rien d'autre n'atteint le SQL.
fn is_local_minute(s: &str) -> bool {
    s.len() == 16 && s.bytes().enumerate().all(|(i, b)| match i {
        4 | 7 => b == b'-',
        10 => b == b'T',
        13 => b == b':',
        _ => b.is_ascii_digit(),
    })
}

pub async fn notifications(pool: &PgPool, user_id: Uuid, now: Option<&str>) -> Result<NotificationList, AppError> {
    // Un rappel raté (heure mal formée, base lente) ne doit pas vider la cloche.
    if let Some(now) = now.filter(|n| is_local_minute(n)) {
        if let Err(error) = collab::remind_events(pool, user_id, now).await {
            tracing::error!(%error, "event reminders failed");
        }
    }
    let (items, unread) = collab::list_notifications(pool, user_id).await.map_err(internal)?;
    Ok(NotificationList { items, unread })
}

pub async fn mark_all_read(pool: &PgPool, user_id: Uuid) -> Result<(), AppError> {
    collab::mark_all_read(pool, user_id).await.map_err(internal)
}

pub async fn members(pool: &PgPool, user_id: Uuid, workspace_id: Uuid) -> Result<Vec<Member>, AppError> {
    let members = collab::members(pool, workspace_id, user_id).await.map_err(internal)?;
    if members.is_empty() { Err(AppError::NotFound) } else { Ok(members) }
}

#[cfg(test)]
mod tests {
    use super::is_local_minute;

    #[test]
    fn accepts_only_a_local_minute() {
        assert!(is_local_minute("2026-11-07T14:30"));
        for bad in ["", "2026-11-07 14:30", "2026-11-07T14:30:00", "2026-11-07T14:3'", "x'; DROP TABLE events;--"] {
            assert!(!is_local_minute(bad), "{bad}");
        }
    }
}
