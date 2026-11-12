use sqlx::{PgPool, postgres::PgPoolOptions};

pub async fn connect(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .min_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(database_url)
        .await
}

pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS paranoia_schema_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )",
    )
    .execute(pool)
    .await?;

    let migrations = [
        (
            20261103141000_i64,
            "identity",
            include_str!("../../migrations/20261103141000_identity.sql"),
        ),
        (
            20261103150000_i64,
            "notes",
            include_str!("../../migrations/20261103150000_notes.sql"),
        ),
        (
            20261103152000_i64,
            "workspaces",
            include_str!("../../migrations/20261103152000_workspaces.sql"),
        ),
        (
            20261103154000_i64,
            "tasks",
            include_str!("../../migrations/20261103154000_tasks.sql"),
        ),
        (
            20261103160000_i64,
            "collaboration",
            include_str!("../../migrations/20261103160000_collaboration.sql"),
        ),
        (
            20261103162000_i64,
            "events",
            include_str!("../../migrations/20261103162000_events.sql"),
        ),
        (
            20261105170000_i64,
            "profile",
            include_str!("../../migrations/20261105170000_profile.sql"),
        ),
        (
            20261105180000_i64,
            "audit",
            include_str!("../../migrations/20261105180000_audit.sql"),
        ),
        (
            20261106100000_i64,
            "team_tasks",
            include_str!("../../migrations/20261106100000_team_tasks.sql"),
        ),
        (
            20261106120000_i64,
            "task_advanced",
            include_str!("../../migrations/20261106120000_task_advanced.sql"),
        ),
        (
            20261107120000_i64,
            "event_reminders",
            include_str!("../../migrations/20261107120000_event_reminders.sql"),
        ),
    ];

    for (version, description, source) in migrations {
        let applied = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (
                SELECT 1 FROM paranoia_schema_migrations WHERE version = $1
            )",
        )
        .bind(version)
        .fetch_one(pool)
        .await?;

        if !applied {
            let mut transaction = pool.begin().await?;
            for statement in source.split(';') {
                let statement = statement.trim();
                if !statement.is_empty() {
                    sqlx::query(statement).execute(&mut *transaction).await?;
                }
            }
            sqlx::query(
                "INSERT INTO paranoia_schema_migrations (version, description)
                 VALUES ($1, $2)",
            )
            .bind(version)
            .bind(description)
            .execute(&mut *transaction)
            .await?;
            transaction.commit().await?;
        }
    }

    Ok(())
}

pub async fn check(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT 1").execute(pool).await.map(|_| ())
}
