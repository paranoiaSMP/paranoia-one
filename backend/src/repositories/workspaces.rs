use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::workspaces::{CreateInvitation, Invitation};
use crate::domain::workspaces::{CreateWorkspace, Workspace};

pub async fn create(
    pool: &PgPool,
    owner_id: Uuid,
    input: &CreateWorkspace,
) -> Result<Workspace, sqlx::Error> {
    let mut transaction = pool.begin().await?;
    let workspace = sqlx::query_as::<_, (Uuid, String)>(
        "INSERT INTO workspaces (owner_id, name) VALUES ($1, $2)
         RETURNING id, name",
    )
    .bind(owner_id)
    .bind(&input.name)
    .fetch_one(&mut *transaction)
    .await?;

    sqlx::query(
        "INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner')",
    )
    .bind(workspace.0)
    .bind(owner_id)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;

    Ok(Workspace {
        id: workspace.0,
        name: workspace.1,
        role: "owner".to_owned(),
    })
}

pub async fn list(pool: &PgPool, user_id: Uuid) -> Result<Vec<Workspace>, sqlx::Error> {
    sqlx::query_as::<_, (Uuid, String, String)>(
        "SELECT workspaces.id, workspaces.name, workspace_members.role
         FROM workspaces
         INNER JOIN workspace_members
           ON workspace_members.workspace_id = workspaces.id
         WHERE workspace_members.user_id = $1
         ORDER BY workspaces.created_at DESC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map(|items| {
        items
            .into_iter()
            .map(|(id, name, role)| Workspace { id, name, role })
            .collect()
    })
}

pub async fn create_invitation(
    pool: &PgPool,
    workspace_id: Uuid,
    inviter_id: Uuid,
    input: &CreateInvitation,
) -> Result<Invitation, sqlx::Error> {
    sqlx::query_as::<_, (Uuid, Uuid, String, String, String, String)>(
        "INSERT INTO workspace_invitations
           (workspace_id, inviter_id, email, role)
         SELECT $1, $2, lower(trim($3)), $4
         WHERE EXISTS (
           SELECT 1 FROM workspace_members
           WHERE workspace_id = $1 AND user_id = $2 AND role IN ('owner', 'admin')
         )
         RETURNING id, workspace_id, email, role, status, expires_at::text",
    )
    .bind(workspace_id)
    .bind(inviter_id)
    .bind(&input.email)
    .bind(&input.role)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| sqlx::Error::RowNotFound)
    .map(invitation)
}

pub async fn accept_invitation(
    pool: &PgPool,
    invitation_id: Uuid,
    user_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let mut transaction = pool.begin().await?;
    let accepted = sqlx::query(
        "UPDATE workspace_invitations AS invitation
         SET status = 'accepted'
         FROM users
         WHERE invitation.id = $1
           AND users.id = $2
           AND invitation.email = users.email_normalized
           AND invitation.status = 'pending'
           AND invitation.expires_at > now()",
    )
    .bind(invitation_id)
    .bind(user_id)
    .execute(&mut *transaction)
    .await?
    .rows_affected()
        == 1;

    if accepted {
        sqlx::query(
            "INSERT INTO workspace_members (workspace_id, user_id, role)
             SELECT workspace_id, $2, role
             FROM workspace_invitations
             WHERE id = $1
             ON CONFLICT (workspace_id, user_id)
             DO UPDATE SET role = EXCLUDED.role",
        )
        .bind(invitation_id)
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;
    }

    transaction.commit().await?;
    Ok(accepted)
}

fn invitation(row: (Uuid, Uuid, String, String, String, String)) -> Invitation {
    Invitation {
        id: row.0,
        workspace_id: row.1,
        email: row.2,
        role: row.3,
        status: row.4,
        expires_at: row.5,
    }
}
