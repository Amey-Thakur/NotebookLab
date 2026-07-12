/*
 * Name: system_commands.rs
 * Purpose: System-level Tauri commands: app version, data directory, REST API
 *   token, and update restart.
 * Description: These commands are always available regardless of model or
 *   database state. They back the Settings page and the update flow.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
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

/// Relaunch the app so a downloaded update takes effect.
/// Only offered by the status bar after the updater stages a new version.
#[tauri::command(rename_all = "snake_case")]
pub fn restart_app(app: AppHandle) {
    app.restart();
}
