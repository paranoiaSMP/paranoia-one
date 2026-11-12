use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    domain::workspaces::{CreateInvitation, CreateWorkspace, Invitation, Workspace},
    error::AppError,
    mail::Mailer,
    repositories::{collab, workspaces},
};

pub async fn invite(
    pool: &PgPool,
    mailer: &Mailer,
    workspace_id: Uuid,
    inviter_id: Uuid,
    input: CreateInvitation,
) -> Result<Invitation, AppError> {
    let email = input.email.trim();
    if !(3..=320).contains(&email.len()) || !email.contains('@') {
        return Err(AppError::InvalidInput);
    }

    if !matches!(input.role.as_str(), "admin" | "member" | "viewer") {
        return Err(AppError::InvalidInput);
    }

    let invitation = workspaces::create_invitation(pool, workspace_id, inviter_id, &input)
        .await
        .map_err(|error| match error {
            sqlx::Error::RowNotFound => AppError::NotFound,
            sqlx::Error::Database(database_error)
                if database_error.code().as_deref() == Some("23505") =>
            {
                AppError::Conflict
            }
            error => {
                tracing::error!(%error, "workspace invitation creation failed");
                AppError::Internal
            }
        })?;
    let inviter = collab::display_name(pool, inviter_id).await.unwrap_or_default();
    collab::notify_invitation(pool, &invitation.email, &inviter, workspace_id).await;
    let team: Option<String> = sqlx::query_scalar("SELECT name FROM workspaces WHERE id = $1").bind(workspace_id).fetch_optional(pool).await.unwrap_or(None);
    if let Some(team) = team {
        let who = if inviter.is_empty() { "Un membre".to_owned() } else { inviter };
        mailer.send(
            &invitation.email,
            &format!("Invitation à rejoindre l'équipe {team}"),
            format!("Bonjour,\n\n{who} t'invite à rejoindre l'équipe « {team} » sur Paranoïa One.\nConnecte-toi à Paranoïa One avec cette adresse e-mail, puis ouvre Équipes pour accepter l'invitation.\n\nSi tu n'attendais pas ce message, tu peux l'ignorer.\n\nParanoïa Studio\n"),
        );
    }
    Ok(invitation)
}

pub async fn accept_invitation(
    pool: &PgPool,
    invitation_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    if workspaces::accept_invitation(pool, invitation_id, user_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, "workspace invitation acceptance failed");
            AppError::Internal
        })?
    {
        Ok(())
    } else {
        Err(AppError::NotFound)
    }
}

pub async fn create(
    pool: &PgPool,
    owner_id: Uuid,
    input: CreateWorkspace,
) -> Result<Workspace, AppError> {
    let name = input.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(AppError::InvalidInput);
    }

    workspaces::create(pool, owner_id, &CreateWorkspace { name })
        .await
        .map_err(|error| {
            tracing::error!(%error, "workspace creation failed");
            AppError::Internal
        })
}

pub async fn list(pool: &PgPool, user_id: Uuid) -> Result<Vec<Workspace>, AppError> {
    workspaces::list(pool, user_id).await.map_err(|error| {
        tracing::error!(%error, "workspace listing failed");
        AppError::Internal
    })
}
