use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct Credentials {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct NewAccount {
    pub email: String,
    pub password: String,
    pub recovery_email: String,
}

#[derive(Debug, Serialize)]
pub struct SessionResponse {
    pub token: String,
    pub expires_in: u32,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: uuid::Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar: Option<String>,
    pub is_admin: bool,
}

#[derive(Debug, Deserialize)]
pub struct ProfileUpdate {
    pub display_name: Option<String>,
    pub avatar: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EmailChange {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct PasswordChange {
    pub current: String,
    pub new: String,
}

#[derive(Debug, Serialize)]
pub struct SessionInfo {
    pub id: uuid::Uuid,
    pub created_at: String,
    pub expires_at: String,
    pub current: bool,
}

#[derive(Debug, Serialize)]
pub struct AccountInfo {
    pub id: uuid::Uuid,
    pub email: String,
    pub recovery_email: Option<String>,
    pub created_at: String,
}
