use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

use super::router;

#[tokio::test]
async fn health_returns_ok() {
    let response = router()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(axum::http::header::X_FRAME_OPTIONS),
        Some(&axum::http::HeaderValue::from_static("DENY"))
    );
    let body = response
        .into_body()
        .collect()
        .await
        .expect("body should be readable")
        .to_bytes();
    assert_eq!(&body[..], br#"{"status":"ok"}"#);
}

#[tokio::test]
async fn unknown_route_returns_not_found() {
    let response = router()
        .oneshot(
            Request::builder()
                .uri("/unknown")
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn readiness_is_unavailable_without_database() {
    let response = router()
        .oneshot(
            Request::builder()
                .uri("/ready")
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn current_user_requires_bearer_token() {
    let response = router()
        .oneshot(
            Request::builder()
                .uri("/api/v1/me")
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn notes_require_bearer_token() {
    let response = router()
        .oneshot(
            Request::builder()
                .uri("/api/v1/notes")
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn workspaces_require_bearer_token() {
    let response = router()
        .oneshot(
            Request::builder()
                .uri("/api/v1/workspaces")
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn workspace_invitations_require_bearer_token() {
    let response = router()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/workspaces/00000000-0000-0000-0000-000000000000/invitations")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"email":"member@example.com"}"#))
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn accepting_workspace_invitations_requires_bearer_token() {
    let response = router()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/workspace-invitations/00000000-0000-0000-0000-000000000000/accept")
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn tasks_require_bearer_token() {
    let response = router()
        .oneshot(
            Request::builder()
                .uri("/api/v1/tasks")
                .body(Body::empty())
                .expect("request should be valid"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn admin_users_require_bearer_token() {
    for method in ["GET", "POST"] {
        let response = router()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri("/api/v1/admin/users")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"email":"a@b.fr","password":"motdepasse-long","recovery_email":"recovery@example.com"}"#))
                    .expect("request should be valid"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{method}");
    }
}

#[tokio::test]
async fn profile_routes_require_bearer_token() {
    for (path, body) in [
        ("/api/v1/me/profile", r#"{"display_name":"Leo","avatar":null}"#),
        ("/api/v1/me/email", r#"{"email":"a@b.fr","password":"motdepasse-long"}"#),
        ("/api/v1/me/password", r#"{"current":"motdepasse-long","new":"autre-motdepasse"}"#),
    ] {
        let response = router()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(path)
                    .header("content-type", "application/json")
                    .body(Body::from(body))
                    .expect("request should be valid"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{path}");
    }
}

#[tokio::test]
async fn audit_and_launcher_routes_require_bearer_token() {
    let id = "00000000-0000-0000-0000-000000000001";
    for (method, path) in [
        ("GET".to_owned(), "/api/v1/admin/audit".to_owned()),
        ("GET".to_owned(), "/api/v1/admin/launcher/installs".to_owned()),
        ("POST".to_owned(), "/api/v1/admin/launcher/installs".to_owned()),
        ("POST".to_owned(), format!("/api/v1/admin/launcher/installs/{id}/revoke")),
        ("POST".to_owned(), format!("/api/v1/admin/launcher/installs/{id}/delete-order")),
        ("POST".to_owned(), "/api/v1/launcher/checkin".to_owned()),
        ("POST".to_owned(), "/api/v1/launcher/incident".to_owned()),
        ("POST".to_owned(), "/api/v1/launcher/deleted".to_owned()),
    ] {
        let response = router()
            .oneshot(
                Request::builder()
                    .method(method.as_str())
                    .uri(path.as_str())
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"label":"x","kind":"tamper"}"#))
                    .expect("request should be valid"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{method} {path}");
    }
}

#[tokio::test]
async fn collaboration_routes_require_bearer_token() {
    let id = "00000000-0000-0000-0000-000000000001";
    for (method, path) in [
        ("GET".to_owned(), format!("/api/v1/tasks/{id}/comments")),
        ("POST".to_owned(), format!("/api/v1/tasks/{id}/comments")),
        ("DELETE".to_owned(), format!("/api/v1/comments/{id}")),
        ("GET".to_owned(), format!("/api/v1/workspaces/{id}/members")),
        ("GET".to_owned(), "/api/v1/notifications".to_owned()),
        ("POST".to_owned(), "/api/v1/notifications/read".to_owned()),
    ] {
        let response = router()
            .oneshot(
                Request::builder()
                    .method(method.as_str())
                    .uri(path.as_str())
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"body":"x"}"#))
                    .expect("request should be valid"),
            )
            .await
            .expect("router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED, "{method} {path}");
    }
}
