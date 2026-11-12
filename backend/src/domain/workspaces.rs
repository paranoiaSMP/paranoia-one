use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateWorkspace {
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvitation {
    pub email: String,
    #[serde(default = "default_member_role")]
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct Invitation {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub email: String,
    pub role: String,
    pub status: String,
    pub expires_at: String,
}

fn default_member_role() -> String {
    "member".to_owned()
}
