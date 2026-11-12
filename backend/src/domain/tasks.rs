use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateTask {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default = "default_priority")]
    pub priority: String,
    pub due_date: Option<String>,
    /// Rattache la tâche à une équipe: tous ses membres la voient. Absent = tâche privée.
    pub workspace_id: Option<Uuid>,
    pub assignee_id: Option<Uuid>,
    /// Sous-tâche d'une tâche de premier niveau: elle hérite de son équipe.
    pub parent_id: Option<Uuid>,
    #[serde(default = "default_recurrence")]
    pub recurrence: String,
}

/// Remplacement complet: `assignee_id` absent retire l'assignation. L'équipe d'une tâche ne change pas.
#[derive(Debug, Deserialize)]
pub struct UpdateTask {
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub assignee_id: Option<Uuid>,
    /// Une seule tâche bloquante par tâche (shortcut: pas de multi-dépendances, à étendre avec une table de liens).
    pub blocked_by: Option<Uuid>,
    #[serde(default = "default_recurrence")]
    pub recurrence: String,
}

#[derive(Debug, Serialize)]
pub struct Task {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub workspace_id: Option<Uuid>,
    pub assignee_id: Option<Uuid>,
    pub assignee: Option<String>,
    pub comments: i64,
    pub parent_id: Option<Uuid>,
    pub blocked_by: Option<Uuid>,
    /// Vrai tant que la tâche bloquante n'est ni terminée ni annulée.
    pub blocked: bool,
    pub recurrence: String,
    pub subtasks: i64,
    pub subtasks_done: i64,
}

fn default_status() -> String {
    "todo".to_owned()
}

fn default_priority() -> String {
    "normal".to_owned()
}

fn default_recurrence() -> String {
    "none".to_owned()
}
