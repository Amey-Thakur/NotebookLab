/*
 * Title: state.rs
 * Tech Stack: Rust, Tauri v2, SQLite
 * Description: Application state managed by Tauri's state system (app.manage()).
 * Important Details: WAL mode
 *   verified after activation. Foreign keys enabled for cascade deletes.
 *   Migrations run from bundled SQL files at startup.
 */

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::AppError;


pub struct AppState {
    /// SQLite database connection. Mutex for thread-safe command access.
    pub db: Mutex<Connection>,
}


impl AppState {
    /// Initialize all application state. Called once during app setup.
    /// Creates data directory, opens database, configures pragmas, and runs migrations.
    pub fn initialize(app: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Internal(format!("Failed to resolve data dir: {e}")))?;

        std::fs::create_dir_all(&data_dir)?;

        let db_path = data_dir.join("notebooklab.db");
        tracing::info!("Database path: {}", db_path.display());

        let conn = Connection::open(&db_path)?;

        /* Configure SQLite for concurrent access and data integrity */
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA busy_timeout = 5000;
             PRAGMA foreign_keys = ON;"
        )?;

        /* Verify WAL mode actually activated (can fail on network filesystems) */
        let wal_mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0))?;
        if wal_mode != "wal" {
            tracing::warn!("WAL mode not active, got: {wal_mode}");
        }

        /* Run schema migrations from bundled resource files */
        Self::run_migrations(&conn)?;

        Ok(Self {
            db: Mutex::new(conn),
        })
    }

    /// Execute all SQL migration files in order.
    /// Uses CREATE IF NOT EXISTS so migrations are safe to re-run.
    fn run_migrations(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
        let migration_sql = include_str!("../resources/migrations/001_initial_schema.sql");
        conn.execute_batch(migration_sql)?;
        tracing::info!("Database migrations applied");
        Ok(())
    }
}
