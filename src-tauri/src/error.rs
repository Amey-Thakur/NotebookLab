/*
 * Title: error.rs
 * Tech Stack: Rust, thiserror, serde, Tauri v2
 * Description: Centralized error types for the backend. All service and repository errors
 *   funnel through AppError, which implements Serialize for Tauri IPC transmission.
 * Important Details: Tauri requires command return errors to be serializable strings.
 *   thiserror generates Display impls. The IntoResponse conversion serializes the error
 *   message as a string that the frontend TauriError class can parse.
 */

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Provider error: {0}")]
    Provider(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Sidecar error: {0}")]
    Sidecar(String),

    #[error("{0}")]
    Internal(String),
}

/* Serialize user-safe messages to the frontend, log full detail on backend */
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        /* Expected errors logged at debug, unexpected at error level */
        match self {
            Self::NotFound(_) | Self::InvalidInput(_) => tracing::debug!("{self}"),
            _ => tracing::error!("{self:?}"),
        }

        let msg = match self {
            Self::NotFound(s) => s.as_str(),
            Self::InvalidInput(s) => s.as_str(),
            Self::Provider(_) => "An AI provider error occurred",
            Self::Database(_) => "A database error occurred",
            Self::Http(_) => "A network error occurred",
            Self::Io(_) => "A file system error occurred",
            Self::Sidecar(s) => s.as_str(),
            Self::Serialization(_) | Self::Internal(_) => "An internal error occurred",
        };

        serializer.serialize_str(msg)
    }
}

pub type AppResult<T> = Result<T, AppError>;

impl From<crate::providers::ProviderError> for AppError {
    fn from(err: crate::providers::ProviderError) -> Self {
        Self::Provider(err.to_string())
    }
}
