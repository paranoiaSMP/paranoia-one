use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct Comment {
    pub id: Uuid,
    pub author: String,
    pub body: String,
    pub created_at: String,
    pub mine: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateComment {
    pub body: String,
}

#[derive(Debug, Serialize)]
pub struct Notification {
    pub id: Uuid,
    pub kind: String,
    pub text: String,
    pub link: String,
    pub read: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct NotificationList {
    pub items: Vec<Notification>,
    pub unread: i64,
}

#[derive(Debug, Serialize)]
pub struct Member {
    pub id: Uuid,
    pub name: String,
    pub role: String,
}
