use std::{env, error::Error, fmt};

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_address: String,
    pub database_url: Option<String>,
    pub dev_admin_email: String,
    pub rust_log: String,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let bind_address = env::var("BIND_ADDRESS").unwrap_or_else(|_| "127.0.0.1:8080".to_owned());
        let database_url = env::var("DATABASE_URL").ok();
        let dev_admin_email =
            env::var("DEV_ADMIN_EMAIL").map_err(|_| ConfigError::MissingDevAdminEmail)?;
        let rust_log = env::var("RUST_LOG").unwrap_or_else(|_| "paranoia_api=info".to_owned());

        bind_address
            .parse::<std::net::SocketAddr>()
            .map_err(|source| ConfigError::InvalidBindAddress {
                value: bind_address.clone(),
                source,
            })?;

        Ok(Self {
            bind_address,
            database_url,
            dev_admin_email,
            rust_log,
        })
    }

    pub fn init_tracing(&self) {
        tracing_subscriber::fmt()
            .with_env_filter(&self.rust_log)
            .with_target(false)
            .compact()
            .init();
    }
}

#[derive(Debug)]
pub enum ConfigError {
    MissingDevAdminEmail,
    InvalidBindAddress {
        value: String,
        source: std::net::AddrParseError,
    },
}

impl fmt::Display for ConfigError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingDevAdminEmail => write!(formatter, "DEV_ADMIN_EMAIL must be configured"),
            Self::InvalidBindAddress { value, .. } => {
                write!(formatter, "invalid BIND_ADDRESS value: {value}")
            }
        }
    }
}

impl Error for ConfigError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::MissingDevAdminEmail => None,
            Self::InvalidBindAddress { source, .. } => Some(source),
        }
    }
}
