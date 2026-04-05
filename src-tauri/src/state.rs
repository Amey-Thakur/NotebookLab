/*
 * Title: state.rs
 * Tech Stack: Rust, Tauri v2, SQLite
 * Description: Application state managed by Tauri's state system (app.manage()).
 * Important Details: All shared state lives here, wrapped in appropriate synchronization
 *   primitives. Commands access state via tauri::State<AppState>. The database connection
 *   pool, active model handle, and config are all managed state.
 */

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::AppError;


pub struct AppState {
    /// SQLite database connection. Wrapped in Mutex for thread-safe access.
    /// WAL mode is enabled at initialization for concurrent read/write.
    pub db: Mutex<Connection>,
}


impl AppState {
    /// Initialize all application state. Called once during app setup.
    /// Creates the data directory, opens the database, and runs migrations.
    pub fn initialize(app: &AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Internal(format!("Failed to resolve data dir: {e}")))?;

        std::fs::create_dir_all(&data_dir)?;

        let db_path = data_dir.join("notebooklab.db");
        tracing::info!("Database path: {}", db_path.display());

        let conn = Connection::open(&db_path)?;

        /* Enable WAL mode for concurrent read/write performance */
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")?;

        Ok(Self {
            db: Mutex::new(conn),
        })
    }
}
