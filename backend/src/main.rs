use std::net::SocketAddr;

use paranoia_api::{config::Config, http, repositories::database};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::from_env()?;
    config.init_tracing();

    let address: SocketAddr = config.bind_address.parse()?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    let database = match config.database_url.as_deref() {
        Some(database_url) => {
            let pool = database::connect(database_url).await?;
            database::migrate(&pool).await?;
            tracing::info!("database connected and migrations applied");
            Some(pool)
        }
        None => {
            tracing::warn!("DATABASE_URL is not set; readiness will remain unavailable");
            None
        }
    };

    tracing::info!(%address, "server started");
    axum::serve(
        listener,
        http::router_with_state(http::AppState {
            database,
            dev_admin_email: config.dev_admin_email,
            mailer: paranoia_api::mail::Mailer::from_env(),
        })
        .into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("shutdown signal received"),
        _ = terminate => tracing::info!("shutdown signal received"),
    }
}
