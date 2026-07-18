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

use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::error::AppResult;

/// Files passed on the command line at launch ("Open with NotebookLab").
/// Held until the frontend is mounted and asks for them, because an event
/// emitted during setup would fire before any listener exists.
pub struct StartupFiles(pub Mutex<Vec<String>>);

/// Keep only arguments that are real, importable files. Flags and stray
/// arguments from the shell or updater are ignored.
pub fn importable_files(args: impl Iterator<Item = String>) -> Vec<String> {
    args.filter(|arg| !arg.starts_with('-'))
        .filter(|arg| {
            let path = std::path::Path::new(arg);
            path.is_file()
                && path
                    .extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(crate::parsers::is_supported_extension)
        })
        .collect()
}

/// The backend's most recent log lines for the Settings log view. Read-only,
/// in-memory, capped at 500 lines; nothing is written to disk.
#[tauri::command(rename_all = "snake_case")]
pub fn get_recent_logs() -> Vec<String> {
    crate::utils::log_buffer::recent_lines()
}

/// Hand over (and clear) the files the app was launched with, so a double
/// opened PDF lands in a notebook exactly once.
#[tauri::command(rename_all = "snake_case")]
pub fn take_startup_files(state: tauri::State<'_, StartupFiles>) -> Vec<String> {
    state
        .0
        .lock()
        .map(|mut files| std::mem::take(&mut *files))
        .unwrap_or_default()
}

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
/// The sidecar is stopped explicitly first so the relaunched app never
/// collides with an orphaned llama-server holding its port.
#[tauri::command(rename_all = "snake_case")]
pub fn restart_app(app: AppHandle) {
    if let Some(sidecar) = app.try_state::<crate::services::sidecar_service::SidecarManager>() {
        sidecar.shutdown();
    }
    app.restart();
}

/// Check GitHub for a newer release and, if one exists, download and stage it.
/// Returns a short status the Settings page shows. The same background check
/// runs at startup; this is the manual "Check for updates" button. When an
/// update is staged it emits "update-ready" so the status bar offers a restart,
/// and the caller can restart with `restart_app`.
#[tauri::command(rename_all = "snake_case")]
pub async fn check_for_updates(app: AppHandle) -> AppResult<String> {
    use tauri::Emitter;
    use tauri_plugin_updater::UpdaterExt;

    let updater = app
        .updater()
        .map_err(|e| crate::error::AppError::Internal(format!("Updater unavailable: {e}")))?;

    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            update
                .download_and_install(|_, _| {}, || {})
                .await
                .map_err(|e| crate::error::AppError::Internal(format!("Download failed: {e}")))?;
            app.emit("update-ready", version.clone()).ok();
            Ok(format!(
                "Version {version} downloaded. Restart to apply it."
            ))
        }
        Ok(None) => Ok("You are on the latest version.".to_string()),
        Err(e) => Err(crate::error::AppError::Internal(format!(
            "Could not check for updates: {e}"
        ))),
    }
}

/// What this computer can run, for the local-model recommendations in the
/// Models page. GPU detection is best-effort via nvidia-smi when present;
/// absence simply means recommendations key off system RAM alone.
#[derive(serde::Serialize)]
pub struct HardwareProfile {
    pub total_ram_gb: f64,
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub gpu_name: Option<String>,
    pub gpu_vram_gb: Option<f64>,
}

/// Detect RAM, CPU, and (best-effort) GPU. Async because the sysinfo refresh
/// and the nvidia-smi probe both take real time.
#[tauri::command(rename_all = "snake_case")]
pub async fn get_hardware_profile() -> AppResult<HardwareProfile> {
    tauri::async_runtime::spawn_blocking(|| {
        use sysinfo::System;

        let mut system = System::new();
        system.refresh_memory();
        system.refresh_cpu_all();

        let cpu_name = system
            .cpus()
            .first()
            .map(|cpu| cpu.brand().trim().to_string())
            .filter(|brand| !brand.is_empty())
            .unwrap_or_else(|| "Unknown CPU".to_string());

        let (gpu_name, gpu_vram_gb) = detect_nvidia_gpu();

        HardwareProfile {
            total_ram_gb: system.total_memory() as f64 / 1_073_741_824.0,
            cpu_name,
            cpu_cores: system.cpus().len(),
            gpu_name,
            gpu_vram_gb,
        }
    })
    .await
    .map_err(|e| crate::error::AppError::Internal(format!("Hardware probe failed: {e}")))
}

/// Query nvidia-smi for the first GPU's name and VRAM. Returns (None, None)
/// when the tool is absent (AMD/Intel/no GPU); recommendations then rely on
/// system RAM, which is the safe lower bound.
fn detect_nvidia_gpu() -> (Option<String>, Option<f64>) {
    let mut command = std::process::Command::new("nvidia-smi");
    command.args([
        "--query-gpu=name,memory.total",
        "--format=csv,noheader,nounits",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let Ok(output) = command.output() else {
        return (None, None);
    };
    if !output.status.success() {
        return (None, None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let Some(line) = stdout.lines().next() else {
        return (None, None);
    };
    let mut parts = line.rsplitn(2, ',');
    let vram_mb: Option<f64> = parts.next().and_then(|v| v.trim().parse().ok());
    let name = parts.next().map(|n| n.trim().to_string());
    (name, vram_mb.map(|mb| mb / 1024.0))
}
