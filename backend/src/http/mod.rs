use axum::{
    Json, Router,
    extract::{ConnectInfo, FromRequestParts, Path, Query, State},
    http::{HeaderValue, Request, StatusCode, header, request::Parts},
    routing::{get, post, put},
};
use serde::Serialize;
use sqlx::PgPool;
use tower_http::{
    catch_panic::CatchPanicLayer, cors::CorsLayer, limit::RequestBodyLimitLayer,
    set_header::SetResponseHeaderLayer, trace::TraceLayer,
};

use crate::{
    auth,
    domain::{
        auth::{Credentials, UserResponse},
        events::{CreateEvent, Event},
        notes::{CreateNote, Note, UpdateNote},
    },
    error::AppError,
    services,
};

#[derive(Clone)]
pub struct AppState {
    pub database: Option<PgPool>,
    pub dev_admin_email: String,
    pub mailer: crate::mail::Mailer,
}

pub fn router() -> Router {
    router_with_state(AppState {
        database: None,
        dev_admin_email: "dev@example.com".to_owned(),
        mailer: crate::mail::Mailer::default(),
    })
}

pub fn router_with_state(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/api/v1/status", get(status))
        .route("/api/v1/auth/register", post(register))
        .route("/api/v1/auth/login", post(login))
        .route("/api/v1/auth/logout", post(logout))
        .route(
            "/api/v1/auth/sessions",
            get(list_sessions).delete(revoke_other_sessions),
        )
        .route(
            "/api/v1/auth/sessions/{id}",
            axum::routing::delete(revoke_session),
        )
        .route("/api/v1/me", get(current_user))
        .route("/api/v1/me/profile", put(update_profile))
        .route("/api/v1/me/email", put(change_email))
        .route("/api/v1/me/password", put(change_password))
        .route(
            "/api/v1/admin/users",
            get(list_accounts).post(create_account),
        )
        .route("/api/v1/admin/audit", get(list_audit))
        .route(
            "/api/v1/admin/launcher/installs",
            get(list_installs).post(create_install),
        )
        .route("/api/v1/admin/launcher/installs/{id}/revoke", post(revoke_install))
        .route("/api/v1/admin/launcher/installs/{id}/reactivate", post(reactivate_install))
        .route("/api/v1/admin/launcher/installs/{id}/delete-order", post(order_install_deletion))
        .route("/api/v1/launcher/checkin", post(launcher_checkin))
        .route("/api/v1/launcher/incident", post(launcher_incident))
        .route("/api/v1/launcher/deleted", post(launcher_deleted))
        .route("/api/v1/notes", get(list_notes).post(create_note))
        .route("/api/v1/notes/{id}", put(update_note).delete(delete_note))
        .route(
            "/api/v1/workspaces",
            get(list_workspaces).post(create_workspace),
        )
        .route(
            "/api/v1/workspaces/{id}/invitations",
            post(create_invitation),
        )
        .route(
            "/api/v1/workspace-invitations/{id}/accept",
            post(accept_invitation),
        )
        .route("/api/v1/tasks", get(list_tasks).post(create_task))
        .route("/api/v1/tasks/{id}", put(update_task).delete(delete_task))
        .route("/api/v1/tasks/{id}/comments", get(list_comments).post(create_comment))
        .route("/api/v1/comments/{id}", axum::routing::delete(delete_comment))
        .route("/api/v1/workspaces/{id}/members", get(list_members))
        .route("/api/v1/notifications", get(list_notifications))
        .route("/api/v1/notifications/read", post(read_notifications))
        .route("/api/v1/events", get(list_events).post(create_event))
        .route("/api/v1/mail/send", post(send_mail))
        .fallback(not_found)
        .layer(RequestBodyLimitLayer::new(1_048_576))
        .layer(
            CorsLayer::new()
                .allow_origin([
                    HeaderValue::from_static("http://localhost:5173"),
                    HeaderValue::from_static("http://127.0.0.1:5173"),
                    HeaderValue::from_static("tauri://localhost"),
                    HeaderValue::from_static("http://tauri.localhost"),
                    HeaderValue::from_static("https://tauri.localhost"),
                ])
                .allow_methods([
                    axum::http::Method::GET,
                    axum::http::Method::POST,
                    axum::http::Method::PUT,
                    axum::http::Method::DELETE,
                ])
                .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]),
        )
        .layer(CatchPanicLayer::new())
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .layer(
            TraceLayer::new_for_http().make_span_with(|request: &Request<_>| {
                tracing::info_span!(
                    "http_request",
                    method = %request.method(),
                    path = %request.uri().path()
                )
            }),
        )
        .with_state(state)
}

/// Adresse du client pour l'audit. shortcut: X-Forwarded-For est cru tel quel (l'API doit rester derrière le reverse proxy), à restreindre aux proxys connus.
struct ClientIp(Option<String>);

impl<S: Send + Sync> FromRequestParts<S> for ClientIp {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        let forwarded = parts
            .headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let peer = parts
            .extensions
            .get::<ConnectInfo<std::net::SocketAddr>>()
            .map(|ConnectInfo(addr)| addr.ip().to_string());
        Ok(Self(forwarded.or(peer)))
    }
}

/// Journal d'audit best-effort, no-op sans base.
async fn log(state: &AppState, actor: (Option<uuid::Uuid>, &str), action: &str, target: &str, ip: &ClientIp, detail: &str) {
    if let Some(pool) = &state.database {
        crate::repositories::audit::record_lossy(pool, actor.0, actor.1, action, target, ip.0.as_deref(), detail).await;
    }
}

/// Réservé aux comptes de `DEV_ADMIN_EMAIL`.
async fn admin<'a>(state: &'a AppState, headers: &axum::http::HeaderMap) -> Result<(&'a PgPool, uuid::Uuid, String), AppError> {
    let token = auth::bearer_token(headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (id, email) = auth::user_from_token(pool, token).await?;
    auth::require_dev_admin(&email, &state.dev_admin_email)?;
    Ok((pool, id, email))
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> (StatusCode, Json<HealthResponse>) {
    (StatusCode::OK, Json(HealthResponse { status: "ok" }))
}

async fn ready(State(state): State<AppState>) -> (StatusCode, Json<HealthResponse>) {
    let Some(database) = state.database else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(HealthResponse {
                status: "not_ready",
            }),
        );
    };
    match crate::repositories::database::check(&database).await {
        Ok(()) => (StatusCode::OK, Json(HealthResponse { status: "ready" })),
        Err(error) => {
            tracing::warn!(%error, "database readiness check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(HealthResponse {
                    status: "not_ready",
                }),
            )
        }
    }
}

async fn status() -> Json<StatusResponse> {
    Json(StatusResponse {
        service: "paranoia-api",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[derive(serde::Deserialize)]
struct OutgoingMail {
    to: String,
    subject: String,
    body: String,
}

#[derive(Serialize)]
struct SentMail {
    from: String,
}

async fn send_mail(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(message): Json<OutgoingMail>,
) -> Result<Json<SentMail>, AppError> {
    admin(&state, &headers).await?;
    let from = state.mailer.send_confirmed(&message.to, &message.subject, message.body).await?;
    Ok(Json(SentMail { from }))
}

async fn register(
    State(state): State<AppState>,
    ip: ClientIp,
    Json(credentials): Json<Credentials>,
) -> Result<(StatusCode, Json<crate::domain::auth::SessionResponse>), AppError> {
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let email = credentials.email.trim().to_ascii_lowercase();
    let session = services::auth::register(pool, credentials, &state.dev_admin_email).await?;
    log(&state, (None, &email), "auth.register", "", &ip, "").await;
    Ok((StatusCode::CREATED, Json(session)))
}

async fn create_account(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
    Json(account): Json<crate::domain::auth::NewAccount>,
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    let (pool, admin_id, admin_email) = admin(&state, &headers).await?;
    let user = services::auth::create_account(pool, account).await?;
    log(&state, (Some(admin_id), &admin_email), "account.created", &user.email, &ip, "").await;
    Ok((StatusCode::CREATED, Json(user)))
}

async fn list_accounts(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<crate::domain::auth::AccountInfo>>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (_, email) = auth::user_from_token(pool, token).await?;
    auth::require_dev_admin(&email, &state.dev_admin_email)?;
    services::auth::list_accounts(pool).await.map(Json)
}

async fn login(
    State(state): State<AppState>,
    ip: ClientIp,
    Json(credentials): Json<Credentials>,
) -> Result<Json<crate::domain::auth::SessionResponse>, AppError> {
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let email = credentials.email.trim().to_ascii_lowercase();
    match services::auth::login(pool, credentials).await {
        Ok(session) => {
            log(&state, (None, &email), "auth.login", "", &ip, "").await;
            Ok(Json(session))
        }
        Err(AppError::InvalidCredentials) => {
            log(&state, (None, &email), "auth.login_failed", "", &ip, "").await;
            Err(AppError::InvalidCredentials)
        }
        Err(error) => Err(error),
    }
}

async fn logout(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, AppError> {
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let token = auth::bearer_token(&headers)?;
    let who = auth::user_from_token(pool, token).await.ok();
    services::auth::logout(pool, token).await?;
    if let Some((id, email)) = who {
        log(&state, (Some(id), &email), "auth.logout", "", &ip, "").await;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn current_user(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<UserResponse>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let mut user = services::auth::current_user(pool, token).await?;
    user.is_admin = auth::is_dev_admin(&user.email, &state.dev_admin_email);
    Ok(Json(user))
}

async fn update_profile(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
    Json(update): Json<crate::domain::auth::ProfileUpdate>,
) -> Result<StatusCode, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, email) = auth::user_from_token(pool, token).await?;
    services::auth::update_profile(pool, user_id, update).await?;
    log(&state, (Some(user_id), &email), "account.profile_updated", "", &ip, "").await;
    Ok(StatusCode::NO_CONTENT)
}

async fn change_email(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
    Json(change): Json<crate::domain::auth::EmailChange>,
) -> Result<StatusCode, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, email) = auth::user_from_token(pool, token).await?;
    let new_email = change.email.trim().to_ascii_lowercase();
    services::auth::change_email(pool, user_id, &email, &state.dev_admin_email, change).await?;
    log(&state, (Some(user_id), &email), "account.email_changed", &new_email, &ip, "").await;
    Ok(StatusCode::NO_CONTENT)
}

async fn change_password(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
    Json(change): Json<crate::domain::auth::PasswordChange>,
) -> Result<StatusCode, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, email) = auth::user_from_token(pool, token).await?;
    services::auth::change_password(pool, user_id, token, change).await?;
    log(&state, (Some(user_id), &email), "account.password_changed", "", &ip, "autres sessions révoquées").await;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_sessions(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<crate::domain::auth::SessionInfo>>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::auth::sessions(pool, user_id, token)
        .await
        .map(Json)
}

async fn revoke_session(
    State(state): State<AppState>,
    ip: ClientIp,
    Path(session_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, email) = auth::user_from_token(pool, token).await?;
    services::auth::revoke_session(pool, user_id, session_id).await?;
    log(&state, (Some(user_id), &email), "session.revoked", &session_id.to_string(), &ip, "").await;
    Ok(StatusCode::NO_CONTENT)
}

async fn revoke_other_sessions(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, email) = auth::user_from_token(pool, token).await?;
    services::auth::revoke_other_sessions(pool, user_id, token).await?;
    log(&state, (Some(user_id), &email), "session.revoked_others", "", &ip, "").await;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_notes(
    State(state): State<AppState>,
    Query(query): Query<crate::domain::pagination::PageQuery>,
    headers: axum::http::HeaderMap,
) -> Result<Json<crate::domain::pagination::Page<Note>>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::notes::list(pool, user_id, &query).await.map(Json)
}

async fn create_note(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(input): Json<CreateNote>,
) -> Result<(StatusCode, Json<Note>), AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, email) = auth::user_from_token(pool, token).await?;
    auth::require_dev_admin(&email, &state.dev_admin_email)?;
    services::notes::create(pool, user_id, input)
        .await
        .map(|note| (StatusCode::CREATED, Json(note)))
}

async fn update_note(
    State(state): State<AppState>,
    Path(note_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
    Json(input): Json<UpdateNote>,
) -> Result<Json<Note>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::notes::update(pool, user_id, note_id, input)
        .await
        .map(Json)
}

async fn delete_note(
    State(state): State<AppState>,
    ip: ClientIp,
    Path(note_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, email) = auth::user_from_token(pool, token).await?;
    services::notes::delete(pool, user_id, note_id).await?;
    log(&state, (Some(user_id), &email), "note.deleted", &note_id.to_string(), &ip, "").await;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_workspaces(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<crate::domain::workspaces::Workspace>>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::workspaces::list(pool, user_id).await.map(Json)
}

async fn create_workspace(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
    Json(input): Json<crate::domain::workspaces::CreateWorkspace>,
) -> Result<(StatusCode, Json<crate::domain::workspaces::Workspace>), AppError> {
    let (pool, user_id, email) = admin(&state, &headers).await?;
    let workspace = services::workspaces::create(pool, user_id, input).await?;
    log(&state, (Some(user_id), &email), "workspace.created", &workspace.name, &ip, "").await;
    Ok((StatusCode::CREATED, Json(workspace)))
}

async fn create_invitation(
    State(state): State<AppState>,
    ip: ClientIp,
    Path(workspace_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
    Json(input): Json<crate::domain::workspaces::CreateInvitation>,
) -> Result<(StatusCode, Json<crate::domain::workspaces::Invitation>), AppError> {
    let (pool, user_id, email) = admin(&state, &headers).await?;
    let invitation = services::workspaces::invite(pool, &state.mailer, workspace_id, user_id, input).await?;
    log(&state, (Some(user_id), &email), "workspace.invited", &workspace_id.to_string(), &ip, "").await;
    Ok((StatusCode::CREATED, Json(invitation)))
}

async fn accept_invitation(
    State(state): State<AppState>,
    ip: ClientIp,
    Path(invitation_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, AppError> {

    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, email) = auth::user_from_token(pool, token).await?;
    services::workspaces::accept_invitation(pool, invitation_id, user_id).await?;
    log(&state, (Some(user_id), &email), "workspace.invitation_accepted", &invitation_id.to_string(), &ip, "").await;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_tasks(
    State(state): State<AppState>,
    Query(query): Query<crate::domain::pagination::PageQuery>,
    headers: axum::http::HeaderMap,
) -> Result<Json<crate::domain::pagination::Page<crate::domain::tasks::Task>>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::tasks::list(pool, user_id, &query).await.map(Json)
}

async fn create_task(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(input): Json<crate::domain::tasks::CreateTask>,
) -> Result<(StatusCode, Json<crate::domain::tasks::Task>), AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::tasks::create(pool, user_id, input)
        .await
        .map(|task| (StatusCode::CREATED, Json(task)))
}

async fn update_task(
    State(state): State<AppState>,
    Path(task_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
    Json(input): Json<crate::domain::tasks::UpdateTask>,
) -> Result<Json<crate::domain::tasks::Task>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::tasks::update(pool, user_id, task_id, input)
        .await
        .map(Json)
}

async fn delete_task(
    State(state): State<AppState>,
    ip: ClientIp,
    Path(task_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, email) = auth::user_from_token(pool, token).await?;
    services::tasks::delete(pool, user_id, task_id).await?;
    log(&state, (Some(user_id), &email), "task.deleted", &task_id.to_string(), &ip, "").await;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_comments(
    State(state): State<AppState>,
    Path(task_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<crate::domain::collab::Comment>>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::collab::comments(pool, user_id, task_id).await.map(Json)
}

async fn create_comment(
    State(state): State<AppState>,
    Path(task_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
    Json(input): Json<crate::domain::collab::CreateComment>,
) -> Result<(StatusCode, Json<crate::domain::collab::Comment>), AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::collab::add_comment(pool, user_id, task_id, &input.body)
        .await
        .map(|comment| (StatusCode::CREATED, Json(comment)))
}

async fn delete_comment(
    State(state): State<AppState>,
    Path(comment_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::collab::delete_comment(pool, user_id, comment_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_members(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<crate::domain::collab::Member>>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::collab::members(pool, user_id, workspace_id).await.map(Json)
}

#[derive(serde::Deserialize)]
struct NotificationsQuery {
    now: Option<String>,
}

async fn list_notifications(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<NotificationsQuery>,
) -> Result<Json<crate::domain::collab::NotificationList>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::collab::notifications(pool, user_id, query.now.as_deref()).await.map(Json)
}

async fn read_notifications(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<StatusCode, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::collab::mark_all_read(pool, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_events(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<Event>>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, _) = auth::user_from_token(pool, token).await?;
    services::events::list(pool, user_id).await.map(Json)
}

async fn create_event(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(input): Json<CreateEvent>,
) -> Result<(StatusCode, Json<Event>), AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    let (user_id, email) = auth::user_from_token(pool, token).await?;
    auth::require_dev_admin(&email, &state.dev_admin_email)?;
    services::events::create(pool, user_id, input)
        .await
        .map(|event| (StatusCode::CREATED, Json(event)))
}

async fn list_audit(
    State(state): State<AppState>,
    Query(query): Query<crate::domain::audit::AuditQuery>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<crate::domain::audit::AuditEntry>>, AppError> {
    let (pool, _, _) = admin(&state, &headers).await?;
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    crate::repositories::audit::list(pool, limit, query.before, query.action.as_deref().unwrap_or(""))
        .await
        .map(Json)
        .map_err(|error| {
            tracing::error!(%error, "audit listing failed");
            AppError::Internal
        })
}

async fn list_installs(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Result<Json<Vec<crate::domain::audit::Install>>, AppError> {
    let (pool, _, _) = admin(&state, &headers).await?;
    services::launcher::list(pool).await.map(Json)
}

async fn create_install(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
    Json(input): Json<crate::domain::audit::CreateInstall>,
) -> Result<(StatusCode, Json<crate::domain::audit::NewInstall>), AppError> {
    let (pool, id, email) = admin(&state, &headers).await?;
    services::launcher::create(pool, &input.label, (id, &email), ip.0.as_deref())
        .await
        .map(|created| (StatusCode::CREATED, Json(created)))
}

async fn install_order(
    state: AppState,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
    id: uuid::Uuid,
    op: services::launcher::Op,
) -> Result<Json<crate::domain::audit::Install>, AppError> {
    let (pool, admin_id, email) = admin(&state, &headers).await?;
    services::launcher::admin_order(pool, id, op, (admin_id, &email), ip.0.as_deref()).await.map(Json)
}

async fn revoke_install(State(state): State<AppState>, ip: ClientIp, Path(id): Path<uuid::Uuid>, headers: axum::http::HeaderMap) -> Result<Json<crate::domain::audit::Install>, AppError> {
    install_order(state, ip, headers, id, services::launcher::Op::Revoke).await
}

async fn reactivate_install(State(state): State<AppState>, ip: ClientIp, Path(id): Path<uuid::Uuid>, headers: axum::http::HeaderMap) -> Result<Json<crate::domain::audit::Install>, AppError> {
    install_order(state, ip, headers, id, services::launcher::Op::Reactivate).await
}

async fn order_install_deletion(State(state): State<AppState>, ip: ClientIp, Path(id): Path<uuid::Uuid>, headers: axum::http::HeaderMap) -> Result<Json<crate::domain::audit::Install>, AppError> {
    install_order(state, ip, headers, id, services::launcher::Op::DeleteOrder).await
}

async fn launcher_checkin(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
    Json(input): Json<crate::domain::audit::Checkin>,
) -> Result<Json<crate::domain::audit::InstallOrder>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    services::launcher::checkin(pool, token, ip.0.as_deref(), input).await.map(Json)
}

async fn launcher_incident(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
    Json(input): Json<crate::domain::audit::Incident>,
) -> Result<Json<crate::domain::audit::InstallOrder>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    services::launcher::incident(pool, token, ip.0.as_deref(), input).await.map(Json)
}

async fn launcher_deleted(
    State(state): State<AppState>,
    ip: ClientIp,
    headers: axum::http::HeaderMap,
) -> Result<Json<crate::domain::audit::InstallOrder>, AppError> {
    let token = auth::bearer_token(&headers)?;
    let pool = state.database.as_ref().ok_or(AppError::Unavailable)?;
    services::launcher::deleted(pool, token, ip.0.as_deref()).await.map(Json)
}

#[derive(Debug, Serialize)]
struct StatusResponse {
    service: &'static str,
    version: &'static str,
}

async fn not_found() -> AppError {
    AppError::NotFound
}

#[cfg(test)]
mod tests;
