use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateEvent {
    pub title: String,
    pub date: String,
    pub start_time: String,
    pub end_time: Option<String>,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Serialize)]
pub struct Event {
    pub id: Uuid,
    pub title: String,
    pub date: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub description: String,
}
