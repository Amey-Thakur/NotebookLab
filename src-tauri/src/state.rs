/*
 * Name: state.rs
 * Purpose: Application state managed by Tauri's state system (app.manage()).
 * Description: WAL mode verified after activation. Foreign keys enabled for
 *   cascade deletes. Migrations run from bundled SQL files at
 *   startup. Provider router sits behind an RwLock so long-running
 *   LLM calls (reads) never block each other; only provider
 *   registration takes the write lock.
 * Tech Stack: Rust, Tauri v2, SQLite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

use rusqlite::Connection;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::parsers::image_ocr_parser::{OcrEngineHandle, DETECTION_MODEL_FILE};
use crate::providers::ProviderRouter;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub providers: RwLock<ProviderRouter>,
    /// Bearer token for the local REST API, generated fresh each session.
    pub api_token: String,
    /// The OCR engine, built once on first image import and cached. `None` until
    /// then, or whenever the models are not installed (image import degrades to
    /// a clear error in that case). Loading the models is the expensive step, so
    /// it happens lazily rather than at startup.
    ocr: Mutex<Option<Arc<OcrEngineHandle>>>,
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

    /// The shared OCR engine, or `None` when the models are not installed.
    ///
    /// Built once from the model files and cached; a successful build is reused
    /// for the session. Failures are not cached, so if the models appear later
    /// (for example after a first-run download) a subsequent import can still
    /// pick them up. The returned handle is an owned clone, so the state lock is
    /// released before the caller goes on to touch the database.
    pub fn ocr_engine(&self, app: &AppHandle) -> Option<Arc<OcrEngineHandle>> {
        let mut cached = self.ocr.lock().ok()?;
        if let Some(engine) = cached.as_ref() {
            return Some(engine.clone());
        }

        let model_dir = resolve_ocr_model_dir(app)?;
        match OcrEngineHandle::from_model_dir(&model_dir) {
            Ok(handle) => {
                let engine = Arc::new(handle);
                *cached = Some(engine.clone());
                Some(engine)
            }
            Err(e) => {
                tracing::debug!("OCR engine unavailable: {e}");
                None
            }
        }
    }
}

/// Find the directory holding the OCR model files: the bundled resources first
/// (always present after install), then the app data directory (dev or a
/// first-run download). Returns `None` when neither has the models.
fn resolve_ocr_model_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resolve("models/ocr", BaseDirectory::Resource) {
        if dir.join(DETECTION_MODEL_FILE).exists() {
            return Some(dir);
        }
    }
    if let Ok(data_dir) = app.path().app_data_dir() {
        let dir = data_dir.join("ocr");
        if dir.join(DETECTION_MODEL_FILE).exists() {
            return Some(dir);
        }
    }
    None
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
            ocr: Mutex::new(None),
        })
    }

    fn run_migrations(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
        let migrations = [
            include_str!("../resources/migrations/001_initial_schema.sql"),
            include_str!("../resources/migrations/002_chat_tables.sql"),
            include_str!("../resources/migrations/003_fts5_search.sql"),
            include_str!("../resources/migrations/004_embeddings.sql"),
            include_str!("../resources/migrations/005_canvas.sql"),
        ];

        for sql in &migrations {
            conn.execute_batch(sql)?;
        }

        tracing::info!("Database migrations applied ({} files)", migrations.len());
        Ok(())
    }
}
