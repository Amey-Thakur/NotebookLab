/*
 * Title: system_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: System-level Tauri commands: health check, app version, data directory.
 * Important Details: These commands are always available regardless of model or database
 *   state. They serve as the baseline for frontend connectivity verification.
 */

use tauri::{AppHandle, Manager};

use crate::error::AppResult;

#[tauri::command(rename_all = "snake_case")]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_data_directory(app: AppHandle) -> AppResult<String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::Internal(e.to_string()))?;

    Ok(path.to_string_lossy().to_string())
}

/// Return the bearer token for the local REST API so users can authenticate
/// scripts against it. Shown in Settings with a copy control.
#[tauri::command(rename_all = "snake_case")]
pub fn get_api_token(state: tauri::State<'_, crate::state::AppState>) -> String {
    state.api_token.clone()
}

#[tauri::command(rename_all = "snake_case")]
pub fn health_check() -> &'static str {
    "ok"
}
