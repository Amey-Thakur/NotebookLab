/*
 * Title: state.rs
 * Tech Stack: Rust, Tauri v2, SQLite
 * Description: Application state managed by Tauri's state system (app.manage()).
 * Important Details: WAL mode verified after activation. Foreign keys enabled for
 *   cascade deletes. Migrations run from bundled SQL files at startup.
 *   Provider router manages multiple LLM backends with dynamic switching.
 */

use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::providers::ProviderRouter;


pub struct AppState {
    pub db: Mutex<Connection>,
    pub providers: Mutex<ProviderRouter>,
}


impl AppState {
    /// Acquire the database connection with graceful poison handling.
    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db
            .lock()
            .map_err(|_| AppError::Internal("Database lock poisoned".into()))
    }
}


impl AppState {
    /// Initialize all application state. Called once during app setup.
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
             PRAGMA foreign_keys = ON;"
        )?;

        let wal_mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0))?;
        if wal_mode != "wal" {
            tracing::warn!("WAL mode not active, got: {wal_mode}");
        }

        Self::run_migrations(&conn)?;

        let provider_router = ProviderRouter::new();

        Ok(Self {
            db: Mutex::new(conn),
            providers: Mutex::new(provider_router),
        })
    }

    fn run_migrations(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
        let migration_sql = include_str!("../resources/migrations/001_initial_schema.sql");
        conn.execute_batch(migration_sql)?;
        tracing::info!("Database migrations applied");
        Ok(())
    }
}
