//! Envoi d'e-mails applicatifs via SMTP (compte `no-reply`, variables `MAIL_*` de docs/06-OPERATIONS/MAIL.md).
//! Sans configuration, l'envoi est désactivé. On ne journalise jamais le contenu des messages.
use std::{env, sync::Arc};

use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Mailbox, header::ContentType},
    transport::smtp::authentication::Credentials,
};

#[derive(Clone, Default)]
pub struct Mailer(Option<Arc<Inner>>);

struct Inner {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
    reply_to: Option<Mailbox>,
}

impl Mailer {
    /// `MAIL_SMTP_HOST` + `MAIL_FROM_ADDRESS` activent l'envoi. `MAIL_SMTP_TLS`: `starttls` (défaut), `implicit` (465) ou `none` (développement local uniquement).
    pub fn from_env() -> Self {
        let (Ok(host), Ok(from)) = (env::var("MAIL_SMTP_HOST"), env::var("MAIL_FROM_ADDRESS")) else {
            tracing::warn!("MAIL_SMTP_HOST / MAIL_FROM_ADDRESS not set; outgoing mail is disabled");
            return Self(None);
        };
        match Self::build(&host, &from) {
            Ok(inner) => Self(Some(Arc::new(inner))),
            Err(error) => {
                tracing::error!(%error, "invalid mail configuration; outgoing mail is disabled");
                Self(None)
            }
        }
    }

    fn build(host: &str, from: &str) -> Result<Inner, Box<dyn std::error::Error>> {
        let name = env::var("MAIL_FROM_NAME").unwrap_or_else(|_| "Paranoïa One".to_owned());
        let from: Mailbox = format!("{name} <{from}>").parse()?;
        let reply_to = env::var("MAIL_REPLY_TO").ok().map(|a| a.parse()).transpose()?;
        let port = env::var("MAIL_SMTP_PORT").ok().map(|p| p.parse::<u16>()).transpose()?;
        let mut builder = match env::var("MAIL_SMTP_TLS").as_deref().unwrap_or("starttls") {
            "implicit" => AsyncSmtpTransport::<Tokio1Executor>::relay(host)?,
            "none" => AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(host),
            _ => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)?,
        };
        if let Some(port) = port {
            builder = builder.port(port);
        }
        if let (Ok(user), Ok(password)) = (env::var("MAIL_SMTP_USERNAME"), env::var("MAIL_SMTP_PASSWORD")) {
            builder = builder.credentials(Credentials::new(user, password));
        }
        Ok(Inner { transport: builder.build(), from, reply_to })
    }

    /// Envoi en tâche de fond: un échec SMTP ne doit jamais faire échouer l'action de l'utilisateur.
    pub fn send(&self, to: &str, subject: &str, body: String) {
        let Some(inner) = self.0.clone() else { return };
        let message = to.parse::<Mailbox>().map_err(|e| e.to_string())
            .and_then(|to| inner.message(to, subject, body).map_err(|e| e.to_string()));
        match message {
            Ok(message) => {
                tokio::spawn(async move {
                    if let Err(error) = inner.transport.send(message).await {
                        tracing::error!(%error, "mail delivery failed");
                    }
                });
            }
            Err(error) => tracing::error!(%error, "mail message rejected"),
        }
    }
}

impl Inner {
    fn message(&self, to: Mailbox, subject: &str, body: String) -> Result<Message, lettre::error::Error> {
        let mut builder = Message::builder().from(self.from.clone()).to(to).subject(subject);
        if let Some(reply_to) = self.reply_to.clone() {
            builder = builder.reply_to(reply_to);
        }
        builder.header(ContentType::TEXT_PLAIN).body(body)
    }
}

impl Mailer {
    pub async fn send_confirmed(&self, to: &str, subject: &str, body: String) -> Result<String, crate::error::AppError> {
        use crate::error::AppError;
        let recipient = to.trim().parse::<lettre::Address>().map_err(|_| AppError::InvalidInput)?;
        let subject = subject.trim();
        if subject.is_empty() || subject.len() > 998 || subject.contains(['\r', '\n']) || body.trim().is_empty() {
            return Err(AppError::InvalidInput);
        }
        let inner = self.0.as_ref().ok_or(AppError::Unavailable)?;
        let message = inner.message(Mailbox::new(None, recipient), subject, body)
            .map_err(|_| AppError::InvalidInput)?;
        inner.transport.send(message).await.map_err(|error| {
            tracing::warn!(status = ?error.status(), "SMTP delivery failed");
            AppError::Internal
        })?;
        Ok(inner.from.email.to_string())
    }
}
