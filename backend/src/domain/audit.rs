use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct AuditEntry {
    pub id: i64,
    pub at: String,
    pub actor_id: Option<Uuid>,
    pub actor: String,
    pub action: String,
    pub target: String,
    pub ip: Option<String>,
    pub detail: String,
}

#[derive(Debug, Deserialize)]
pub struct AuditQuery {
    pub limit: Option<i64>,
    pub before: Option<i64>,
    pub action: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Install {
    pub id: Uuid,
    pub label: String,
    pub status: String,
    pub version: Option<String>,
    pub binary_hash: Option<String>,
    pub last_seen: Option<String>,
    pub last_ip: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateInstall {
    pub label: String,
}

/// Le jeton n'est renvoyé qu'ici, une seule fois: la base ne garde que son empreinte.
#[derive(Debug, Serialize)]
pub struct NewInstall {
    pub install: Install,
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct Checkin {
    pub version: Option<String>,
    pub binary_hash: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Incident {
    pub kind: String,
    pub detail: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InstallOrder {
    pub status: String,
}
