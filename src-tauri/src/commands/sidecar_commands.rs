/*
 * Title: sidecar_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri commands for managing the llama-server sidecar process.
 *   Exposes start, stop, and status endpoints to the frontend.
 * Important Details: The sidecar is started on a random available port with a
 *   per-session API key. Health is checked by probing /health. When started,
 *   it auto-registers as a provider in the ProviderRouter.
 */

use crate::error::AppResult;
use crate::services::sidecar_service;


/// Check if the sidecar binary exists in the app bundle.
/// Returns false if the binary is not found (e.g., dev build without download).
#[tauri::command]
pub fn sidecar_available(app: tauri::AppHandle) -> AppResult<bool> {
    /* Check if llama-server sidecar resolves to an actual file.
       Tauri resolves sidecars relative to the app binary with platform suffix. */
    use tauri_plugin_shell::ShellExt;
    let available = app.shell().sidecar("llama-server").is_ok();
    Ok(available)
}


/// Get sidecar status information for the frontend UI.
#[tauri::command]
pub fn get_sidecar_status() -> AppResult<SidecarStatusInfo> {
    Ok(SidecarStatusInfo {
        available: true,
        health_endpoint: "/health".to_string(),
    })
}


#[derive(serde::Serialize)]
pub struct SidecarStatusInfo {
    pub available: bool,
    pub health_endpoint: String,
}


/// Find an available port (utility for the frontend to know where to expect the server).
#[tauri::command]
pub fn find_sidecar_port() -> AppResult<u16> {
    Ok(sidecar_service::find_available_port())
}
