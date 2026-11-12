use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::{
        pagination::{Page, PageQuery},
        tasks::{CreateTask, Task, UpdateTask},
    },
    error::AppError,
    repositories::{collab, tasks},
};

const STATUSES: [&str; 4] = ["todo", "in_progress", "done", "cancelled"];
const RECURRENCES: [&str; 4] = ["none", "daily", "weekly", "monthly"];
const PRIORITIES: [&str; 4] = ["low", "normal", "high", "urgent"];

pub async fn list(
    pool: &PgPool,
    user_id: Uuid,
    query: &PageQuery,
) -> Result<Page<Task>, AppError> {
    query.limit().map_err(|_| AppError::InvalidInput)?;
    query.offset().map_err(|_| AppError::InvalidInput)?;
    tasks::list(pool, user_id, query).await.map_err(internal)
}

pub async fn create(pool: &PgPool, owner_id: Uuid, input: CreateTask) -> Result<Task, AppError> {
    validate(&input.title, &input.description, &input.status, &input.priority, &input.recurrence)?;
    let mut workspace_id = input.workspace_id;
    if let Some(parent_id) = input.parent_id {
        let parent = tasks::access(pool, owner_id, parent_id).await.map_err(internal)?.ok_or(AppError::NotFound)?;
        if !parent.can_write {
            return Err(AppError::Forbidden);
        }
        if parent.parent_id.is_some() {
            return Err(AppError::InvalidInput); // un seul niveau de sous-tâches
        }
        workspace_id = parent.workspace_id;
    } else if let Some(workspace_id) = workspace_id {
        match tasks::workspace_role(pool, workspace_id, owner_id).await.map_err(internal)?.as_deref() {
            None => return Err(AppError::NotFound),
            Some("viewer") => return Err(AppError::Forbidden),
            Some(_) => {}
        }
    }
    check_assignee(pool, workspace_id, input.assignee_id).await?;
    let task = tasks::create(pool, owner_id, &input, workspace_id).await.map_err(internal)?;
    if let Some(assignee) = input.assignee_id {
        notify_assignment(pool, owner_id, assignee, &task).await;
    }
    Ok(task)
}

pub async fn update(
    pool: &PgPool,
    user_id: Uuid,
    task_id: Uuid,
    input: UpdateTask,
) -> Result<Task, AppError> {
    validate(&input.title, &input.description, &input.status, &input.priority, &input.recurrence)?;
    let access = tasks::access(pool, user_id, task_id).await.map_err(internal)?.ok_or(AppError::NotFound)?;
    if !access.can_write {
        return Err(AppError::Forbidden);
    }
    check_assignee(pool, access.workspace_id, input.assignee_id).await?;
    let finishing = input.status == "done" && tasks::get(pool, task_id).await.map_err(internal)?.status != "done";
    if let Some(blocker) = input.blocked_by {
        let status = tasks::blocker_status(pool, task_id, blocker).await.map_err(internal)?.ok_or(AppError::InvalidInput)?;
        if finishing && !matches!(status.as_str(), "done" | "cancelled") {
            return Err(AppError::Conflict); // on ne termine pas une tâche encore bloquée
        }
    }
    let task = tasks::update(pool, task_id, &input).await.map_err(internal)?;
    if finishing {
        tasks::spawn_next(pool, task_id).await.map_err(internal)?;
    }
    if input.assignee_id != access.assignee_id
        && let Some(assignee) = input.assignee_id
    {
        notify_assignment(pool, user_id, assignee, &task).await;
    }
    Ok(task)
}

pub async fn delete(pool: &PgPool, user_id: Uuid, task_id: Uuid) -> Result<(), AppError> {
    let access = tasks::access(pool, user_id, task_id).await.map_err(internal)?.ok_or(AppError::NotFound)?;
    if !access.can_delete {
        return Err(AppError::Forbidden);
    }
    tasks::delete(pool, task_id).await.map_err(internal)
}

/// Une tâche ne peut être assignée qu'à un membre de son équipe.
async fn check_assignee(pool: &PgPool, workspace_id: Option<Uuid>, assignee: Option<Uuid>) -> Result<(), AppError> {
    let Some(assignee) = assignee else { return Ok(()) };
    let Some(workspace_id) = workspace_id else { return Err(AppError::InvalidInput) };
    match tasks::workspace_role(pool, workspace_id, assignee).await.map_err(internal)? {
        Some(_) => Ok(()),
        None => Err(AppError::InvalidInput),
    }
}

async fn notify_assignment(pool: &PgPool, actor: Uuid, assignee: Uuid, task: &Task) {
    if assignee == actor {
        return;
    }
    let who = collab::display_name(pool, actor).await.unwrap_or_default();
    let link = task.workspace_id.map_or("tasks".to_owned(), |w| format!("tasks:{w}"));
    collab::notify(pool, assignee, "assignment", &format!("{who} t'a assigné « {} »", task.title), &link).await;
}

fn validate(title: &str, description: &str, status: &str, priority: &str, recurrence: &str) -> Result<(), AppError> {
    if title.trim().is_empty()
        || title.chars().count() > 200
        || description.chars().count() > 100_000
        || !STATUSES.contains(&status)
        || !PRIORITIES.contains(&priority)
        || !RECURRENCES.contains(&recurrence)
    {
        return Err(AppError::InvalidInput);
    }
    Ok(())
}

fn internal(error: sqlx::Error) -> AppError {
    tracing::error!(%error, "tasks repository operation failed");
    AppError::Internal
}
