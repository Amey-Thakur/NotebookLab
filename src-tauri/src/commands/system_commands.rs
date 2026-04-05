/*
 * Title: system_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: System-level Tauri commands: health check, app version, data directory.
 * Important Details: These commands are always available regardless of model or database
 *   state. They serve as the baseline for frontend connectivity verification.
 */

use tauri::{AppHandle, Manager};

use crate::error::AppResult;


#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}


#[tauri::command]
pub fn get_data_directory(app: AppHandle) -> AppResult<String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

    Ok(path.to_string_lossy().to_string())
}


#[tauri::command]
pub fn health_check() -> &'static str {
    "ok"
}
