/*
 * Title: state.rs
 * Tech Stack: Rust, Tauri v2, SQLite
 * Description: Application state managed by Tauri's state system (app.manage()).
 * Important Details: WAL mode verified after activation. Foreign keys enabled for
 *   cascade deletes. Migrations run from bundled SQL files at startup.
 *   Provider router sits behind an RwLock so long-running LLM calls (reads)
 *   never block each other; only provider registration takes the write lock.
 */

use std::sync::{Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::providers::ProviderRouter;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub providers: RwLock<ProviderRouter>,
    /// Bearer token for the local REST API, generated fresh each session.
    pub api_token: String,
}

impl AppState {
    /// Acquire the database connection with graceful poison handling.
    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db
            .lock()
            .map_err(|_| AppError::Internal("Database lock poisoned".into()))
    }

    /// Acquire shared read access to the provider router. Chat completions and
    /// embeddings only need read access, so concurrent AI calls do not serialize.
    pub fn provider_read(&self) -> AppResult<RwLockReadGuard<'_, ProviderRouter>> {
        self.providers
            .read()
            .map_err(|_| AppError::Internal("Provider lock poisoned".into()))
    }

    /// Acquire exclusive write access to the provider router (registration only).
    pub fn provider_write(&self) -> AppResult<RwLockWriteGuard<'_, ProviderRouter>> {
        self.providers
            .write()
            .map_err(|_| AppError::Internal("Provider lock poisoned".into()))
    }
}

impl AppState {
    /// Initialize all application state. Called once during app setup.
    /// The REST API token is generated here so both the HTTP server and the
    /// get_api_token command can hand out the same value.
    pub fn initialize(app: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Internal(format!("Failed to resolve data dir: {e}")))?;

        std::fs::create_dir_all(&data_dir)?;

        let db_path = data_dir.join("notebooklab.db");
        tracing::info!("Database path: {}", db_path.display());

        let conn = Connection::open(&db_path)?;

        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA busy_timeout = 5000;
             PRAGMA foreign_keys = ON;",
        )?;

        let wal_mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0))?;
        if wal_mode != "wal" {
            tracing::warn!("WAL mode not active, got: {wal_mode}");
        }

        Self::run_migrations(&conn)?;

        let provider_router = ProviderRouter::new();

        Ok(Self {
            db: Mutex::new(conn),
            providers: RwLock::new(provider_router),
            api_token: format!("nbl-api-{}", uuid::Uuid::new_v4().simple()),
        })
    }

    fn run_migrations(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
        let migrations = [
            include_str!("../resources/migrations/001_initial_schema.sql"),
            include_str!("../resources/migrations/002_chat_tables.sql"),
            include_str!("../resources/migrations/003_fts5_search.sql"),
            include_str!("../resources/migrations/004_embeddings.sql"),
        ];

        for sql in &migrations {
            conn.execute_batch(sql)?;
        }

        tracing::info!("Database migrations applied ({} files)", migrations.len());
        Ok(())
    }
}
