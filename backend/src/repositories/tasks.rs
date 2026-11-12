use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::{
    pagination::{Page, PageQuery, cursor},
    tasks::{CreateTask, Task, UpdateTask},
};

type TaskRow = (
    Uuid, String, String, String, String, Option<String>, Option<Uuid>, Option<Uuid>, Option<String>, i64,
    Option<Uuid>, Option<Uuid>, String, bool, i64, i64,
);

const SELECT: &str = "SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date::text,
        t.workspace_id, t.assignee_id, COALESCE(u.display_name, split_part(u.email, '@', 1)),
        (SELECT count(*) FROM task_comments c WHERE c.task_id = t.id),
        t.parent_id, t.blocked_by, t.recurrence,
        EXISTS (SELECT 1 FROM tasks b WHERE b.id = t.blocked_by AND b.status NOT IN ('done', 'cancelled')),
        (SELECT count(*) FROM tasks s WHERE s.parent_id = t.id),
        (SELECT count(*) FROM tasks s WHERE s.parent_id = t.id AND s.status = 'done')
     FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id";

/// Ce que `user` peut faire d'une tâche: propriétaire, ou membre de son équipe (le rôle `viewer` lit seulement).
pub struct Access {
    pub title: String,
    pub owner_id: Uuid,
    pub assignee_id: Option<Uuid>,
    pub workspace_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub can_write: bool,
    pub can_delete: bool,
}

pub async fn access(pool: &PgPool, user_id: Uuid, task_id: Uuid) -> Result<Option<Access>, sqlx::Error> {
    sqlx::query_as::<_, (String, Uuid, Option<Uuid>, Option<Uuid>, Option<Uuid>, bool, bool)>(
        "SELECT t.title, t.owner_id, t.assignee_id, t.workspace_id, t.parent_id,
                COALESCE(t.owner_id = $1 OR m.role IN ('owner', 'admin', 'member'), false),
                COALESCE(t.owner_id = $1 OR m.role IN ('owner', 'admin'), false)
         FROM tasks t
         LEFT JOIN workspace_members m ON m.workspace_id = t.workspace_id AND m.user_id = $1
         WHERE t.id = $2 AND (t.owner_id = $1 OR m.user_id IS NOT NULL)",
    )
    .bind(user_id)
    .bind(task_id)
    .fetch_optional(pool)
    .await
    .map(|row| {
        row.map(|r| Access { title: r.0, owner_id: r.1, assignee_id: r.2, workspace_id: r.3, parent_id: r.4, can_write: r.5, can_delete: r.6 })
    })
}

pub async fn workspace_role(pool: &PgPool, workspace_id: Uuid, user_id: Uuid) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2")
        .bind(workspace_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
}

pub async fn list(
    pool: &PgPool,
    user_id: Uuid,
    query: &PageQuery,
) -> Result<Page<Task>, sqlx::Error> {
    let limit = query.limit().expect("validated page limit");
    let offset = query.offset().expect("validated page cursor");
    let search = query.search();
    let items = sqlx::query_as::<_, TaskRow>(&format!(
        "{SELECT}
         WHERE (t.owner_id = $1 OR t.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = $1))
           AND ($2::text IS NULL OR t.title ILIKE '%' || $2 || '%' OR t.description ILIKE '%' || $2 || '%')
         ORDER BY t.updated_at DESC, t.id DESC
         LIMIT $3 OFFSET $4"
    ))
    .bind(user_id)
    .bind(search)
    .bind(limit + 1)
    .bind(offset)
    .fetch_all(pool)
    .await?;
    let mut tasks: Vec<Task> = items.into_iter().map(task).collect();
    let has_more = tasks.len() > limit as usize;
    if has_more {
        tasks.pop();
    }
    Ok(Page {
        items: tasks,
        next_cursor: has_more.then(|| cursor(offset + limit)),
    })
}

pub async fn get(pool: &PgPool, task_id: Uuid) -> Result<Task, sqlx::Error> {
    sqlx::query_as::<_, TaskRow>(&format!("{SELECT} WHERE t.id = $1"))
        .bind(task_id)
        .fetch_one(pool)
        .await
        .map(task)
}

pub async fn create(
    pool: &PgPool,
    owner_id: Uuid,
    input: &CreateTask,
    workspace_id: Option<Uuid>,
) -> Result<Task, sqlx::Error> {
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO tasks (owner_id, title, description, status, priority, due_date, workspace_id, assignee_id, parent_id, recurrence)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10)
         RETURNING id",
    )
    .bind(owner_id)
    .bind(&input.title)
    .bind(&input.description)
    .bind(&input.status)
    .bind(&input.priority)
    .bind(&input.due_date)
    .bind(workspace_id)
    .bind(input.assignee_id)
    .bind(input.parent_id)
    .bind(&input.recurrence)
    .fetch_one(pool)
    .await?;
    get(pool, id).await
}

/// L'autorisation est vérifiée avant par `access`.
pub async fn update(pool: &PgPool, task_id: Uuid, input: &UpdateTask) -> Result<Task, sqlx::Error> {
    sqlx::query(
        "UPDATE tasks SET title = $1, description = $2, status = $3,
         priority = $4, due_date = $5::date, assignee_id = $6, blocked_by = $7, recurrence = $8, updated_at = now()
         WHERE id = $9",
    )
    .bind(&input.title)
    .bind(&input.description)
    .bind(&input.status)
    .bind(&input.priority)
    .bind(&input.due_date)
    .bind(input.assignee_id)
    .bind(input.blocked_by)
    .bind(&input.recurrence)
    .bind(task_id)
    .execute(pool)
    .await?;
    get(pool, task_id).await
}

pub async fn delete(pool: &PgPool, task_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(task_id)
        .execute(pool)
        .await
        .map(|_| ())
}

fn task(row: TaskRow) -> Task {
    Task {
        id: row.0,
        title: row.1,
        description: row.2,
        status: row.3,
        priority: row.4,
        due_date: row.5,
        workspace_id: row.6,
        assignee_id: row.7,
        assignee: row.8,
        comments: row.9,
        parent_id: row.10,
        blocked_by: row.11,
        recurrence: row.12,
        blocked: row.13,
        subtasks: row.14,
        subtasks_done: row.15,
    }
}

/// Statut de la tâche bloquante si le lien est permis: même équipe (ou même propriétaire en privé), pas de cycle.
pub async fn blocker_status(pool: &PgPool, task_id: Uuid, blocker_id: Uuid) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT b.status FROM tasks t, tasks b
         WHERE t.id = $1 AND b.id = $2 AND b.id <> t.id
           AND b.workspace_id IS NOT DISTINCT FROM t.workspace_id
           AND (t.workspace_id IS NOT NULL OR b.owner_id = t.owner_id)
           AND NOT EXISTS (
             WITH RECURSIVE chain(id) AS (
               SELECT $2::uuid
               UNION
               SELECT x.blocked_by FROM tasks x JOIN chain c ON x.id = c.id WHERE x.blocked_by IS NOT NULL
             ) SELECT 1 FROM chain WHERE id = $1)",
    )
    .bind(task_id)
    .bind(blocker_id)
    .fetch_optional(pool)
    .await
}

/// Occurrence suivante d'une tâche récurrente terminée: même contenu, échéance décalée d'une période.
pub async fn spawn_next(pool: &PgPool, task_id: Uuid) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO tasks (owner_id, title, description, status, priority, due_date, workspace_id, assignee_id, parent_id, recurrence)
         SELECT owner_id, title, description, 'todo', priority,
                (COALESCE(due_date, current_date) + CASE recurrence
                    WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '7 days' ELSE interval '1 month' END)::date,
                workspace_id, assignee_id, parent_id, recurrence
         FROM tasks WHERE id = $1 AND recurrence <> 'none'",
    )
    .bind(task_id)
    .execute(pool)
    .await
    .map(|_| ())
}
