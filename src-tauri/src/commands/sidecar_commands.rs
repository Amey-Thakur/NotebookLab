/*
 * Name: sidecar_commands.rs
 * Purpose: Tauri commands for managing the llama-server sidecar process.
 * Description: Exposes start, stop, and status endpoints to the frontend.
 *   Uses atomic compare-exchange to prevent double-start races. A
 *   cancellation flag is shared between the stdout-reader and
 *   health-poller threads so the poller aborts immediately when
 *   the process exits. The API key is passed to the provider
 *   registration so auth works end-to-end.
 * Tech Stack: Rust, Tauri v2 Shell Plugin
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use std::sync::atomic::Ordering;

use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::error::{AppError, AppResult};
use crate::providers::openai_compatible::OpenAiCompatibleProvider;
use crate::services::sidecar_service::{
    self, SidecarManager, SidecarStatusInfo, STATE_CRASHED, STATE_READY, STATE_STARTING,
    STATE_STOPPED,
};
use crate::state::AppState;

/// Provider name registered for the managed llama-server process.
/// Shared between registration, stop, and crash handling so activation
/// state stays consistent across restarts.
pub const SIDECAR_PROVIDER_NAME: &str = "llama.cpp (sidecar)";

/// Whether the llama-server sidecar is configured and its command path
/// resolves. This does not stat the file, so it returns true even if the binary
/// is missing from the bundle; an actually-missing binary surfaces as a spawn
/// error when start_sidecar runs.
#[tauri::command(rename_all = "snake_case")]
pub fn sidecar_available(app: tauri::AppHandle) -> AppResult<bool> {
    let available = app.shell().sidecar("llama-server").is_ok();
    Ok(available)
}

/// Get current sidecar status for the frontend UI.
#[tauri::command(rename_all = "snake_case")]
pub fn get_sidecar_status(sidecar: State<'_, SidecarManager>) -> AppResult<SidecarStatusInfo> {
    Ok(SidecarStatusInfo {
        state: sidecar.current_state(),
        port: sidecar.port(),
        model_path: sidecar.model_path(),
        pid: sidecar.pid(),
    })
}

/// Start the llama-server sidecar with a specified model file.
/// If model_path is empty, scans the models directory for GGUF files.
#[tauri::command(rename_all = "snake_case")]
pub fn start_sidecar(
    app: tauri::AppHandle,
    sidecar: State<'_, SidecarManager>,
    model_path: Option<String>,
) -> AppResult<SidecarStatusInfo> {
    /* Atomic transition into STARTING. Prevents double-start races while
    allowing restart after a crash (CRASHED is a recoverable state). */
    if !sidecar.try_transition(STATE_STOPPED, STATE_STARTING)
        && !sidecar.try_transition(STATE_CRASHED, STATE_STARTING)
    {
        /* Already running or starting, return current status */
        return Ok(SidecarStatusInfo {
            state: sidecar.current_state(),
            port: sidecar.port(),
            model_path: sidecar.model_path(),
            pid: sidecar.pid(),
        });
    }

    /* Reset cancellation flag for this new launch */
    sidecar.cancelled.store(false, Ordering::Release);

    /* Resolve and validate model path */
    let data_dir = app.path().app_data_dir().map_err(|e| {
        sidecar.set_state(STATE_STOPPED);
        AppError::Internal(format!("Failed to resolve data dir: {e}"))
    })?;
    let models_dir = data_dir.join("models").join("gguf");

    let model = match model_path {
        Some(ref p) if !p.is_empty() => {
            let path = std::path::PathBuf::from(p);
            /* Validate path is within the models directory to prevent traversal */
            if !sidecar_service::validate_model_path(&path, &models_dir) {
                sidecar.set_state(STATE_STOPPED);
                return Err(AppError::InvalidInput(
                    "Model path must be within the models directory".into(),
                ));
            }
            path
        }
        _ => {
            let models = sidecar_service::find_model_files(&models_dir);
            match models.into_iter().next() {
                Some(m) => m,
                None => {
                    sidecar.set_state(STATE_STOPPED);
                    return Err(AppError::InvalidInput(format!(
                        "No GGUF model files found in {}. Download a model first.",
                        models_dir.display()
                    )));
                }
            }
        }
    };

    if !model.exists() {
        sidecar.set_state(STATE_STOPPED);
        return Err(AppError::InvalidInput(format!(
            "Model file not found: {}",
            model.display()
        )));
    }

    let model_str = model.to_string_lossy().to_string();

    /* Allocate port and generate API key */
    let port = sidecar_service::find_available_port();
    let api_key = sidecar_service::generate_session_key();

    sidecar.configure(port, api_key.clone(), model_str.clone(), 0);

    tracing::info!("Starting llama-server on port {port}");

    /* Build sidecar command via Tauri shell plugin */
    let args = sidecar_service::build_sidecar_args(port, &model_str);

    let sidecar_cmd = app.shell().sidecar("llama-server").map_err(|e| {
        sidecar.set_state(STATE_STOPPED);
        AppError::Internal(format!("Failed to resolve sidecar binary: {e}"))
    })?;

    let mut sidecar_cmd = sidecar_cmd
        .args(args)
        .env(sidecar_service::api_key_env_var(), &api_key);

    /* Point the child at its bundled shared libraries (DLLs / dylibs / .so).
    The llama.cpp release binaries link against libraries shipped in the
    same archive; installers place them under the resource directory. */
    let resource_dir = app.path().resource_dir().ok();
    for (key, value) in sidecar_service::library_env(resource_dir) {
        sidecar_cmd = sidecar_cmd.env(key, value);
    }

    /* Spawn the process */
    let (mut rx, child) = sidecar_cmd.spawn().map_err(|e| {
        sidecar.set_state(STATE_STOPPED);
        AppError::Internal(format!("Failed to spawn llama-server: {e}"))
    })?;

    let child_pid = child.pid();
    /* Update PID under the existing lock set by configure() */
    {
        let mut inner = sidecar.inner_lock();
        inner.pid = child_pid;
    }
    /* Keep the handle so stop and app exit can terminate the process */
    sidecar.set_child(child);

    tracing::info!("llama-server spawned (PID: {child_pid})");

    /* Background thread: drain stdout/stderr and detect termination.
    Sets the cancellation flag so the health poller aborts immediately. */
    let handle = app.clone();
    std::thread::spawn(move || {
        while let Some(event) = rx.blocking_recv() {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    /* Filter out lines that might contain the API key */
                    if !text.contains("nbl-") {
                        tracing::debug!("llama-server: {text}");
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    if !text.contains("nbl-") {
                        tracing::debug!("llama-server stderr: {text}");
                    }
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    let mgr: State<'_, SidecarManager> = handle.state();
                    mgr.cancelled.store(true, Ordering::Release);

                    /* Only mark CRASHED for unexpected exits. A clean stop has
                    already moved the state to STOPPED, and overwriting it
                    here would strand the manager in a phantom crash. */
                    let crashed = mgr
                        .try_transition(STATE_STARTING, sidecar_service::STATE_CRASHED)
                        || mgr.try_transition(STATE_READY, sidecar_service::STATE_CRASHED);

                    if crashed {
                        tracing::warn!("llama-server exited unexpectedly: {:?}", status);
                        /* Deactivate the dead provider so chat reports "no
                        provider" instead of opaque connection errors. The
                        trailing semicolon drops the guard before `state`. */
                        let state: State<'_, AppState> = handle.state();
                        if let Ok(providers) = state.provider_read() {
                            providers.deactivate_if_named(SIDECAR_PROVIDER_NAME);
                        };
                    } else {
                        tracing::info!("llama-server exited after stop: {:?}", status);
                    }

                    {
                        let mut inner = mgr.inner_lock();
                        inner.pid = 0;
                    }
                    /* Drop the stale child handle; the process is gone */
                    drop(mgr.take_child());
                    break;
                }
                _ => {}
            }
        }
    });

    /* Background thread: poll health and register provider when ready.
    The cancelled flag lets this thread abort early if the process dies. */
    let handle2 = app.clone();
    let api_key_for_provider = api_key;
    let model_name = model
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("local-model")
        .to_string();

    std::thread::spawn(move || {
        let mgr: State<'_, SidecarManager> = handle2.state();

        /* Wait up to 120 seconds, but abort early if process exits */
        let ready = sidecar_service::wait_for_ready(port, 120, &mgr.cancelled);

        if ready {
            /* Atomically claim the READY transition. If a concurrent stop
            already moved us out of STARTING (to STOPPING/STOPPED) and killed the
            child, do not resurrect a dead server by re-registering it. */
            if !mgr.try_transition(
                sidecar_service::STATE_STARTING,
                sidecar_service::STATE_READY,
            ) {
                return;
            }
            tracing::info!("llama-server ready on port {port}");

            /* Register as provider with the API key for auth. Replace any
            entry from a previous run so restarts do not accumulate
            duplicate providers pointing at dead ports. */
            let state: State<'_, AppState> = handle2.state();
            if let Ok(mut providers) = state.provider_write() {
                let provider = OpenAiCompatibleProvider::new(
                    SIDECAR_PROVIDER_NAME.to_string(),
                    format!("http://127.0.0.1:{port}"),
                    Some(api_key_for_provider),
                    model_name,
                    true,
                );
                let provider_box: Box<dyn crate::providers::traits::LlmProvider> =
                    Box::new(provider);
                let index = providers.register_or_replace(provider_box);
                if providers.set_active(index).is_ok() {
                    tracing::info!("Sidecar auto-activated as provider (index {index})");
                }
            };
        } else if !mgr.cancelled.load(Ordering::Acquire) {
            /* Only set crashed if it wasn't already set by the termination handler */
            tracing::error!("llama-server failed to become ready within 120s");
            /* The process can still be alive here (a large model loading past the
            timeout). Kill it so it does not linger as a multi-GB orphan and get
            leaked when the user clicks Start again. */
            if let Some(child) = mgr.take_child() {
                let _ = child.kill();
            }
            mgr.set_state(sidecar_service::STATE_CRASHED);
        }
    });

    Ok(SidecarStatusInfo {
        state: sidecar_service::SidecarState::Starting,
        port,
        model_path: model_str,
        pid: child_pid,
    })
}

/// Stop the sidecar process and deactivate its provider entry.
/// Safe to call from any state: a crashed sidecar is reset to Stopped so it
/// can be started again.
#[tauri::command(rename_all = "snake_case")]
pub fn stop_sidecar(
    state: State<'_, AppState>,
    sidecar: State<'_, SidecarManager>,
) -> AppResult<()> {
    /* Route chat away from the server that is about to die */
    if let Ok(providers) = state.provider_read() {
        providers.deactivate_if_named(SIDECAR_PROVIDER_NAME);
    }

    sidecar.set_state(sidecar_service::STATE_STOPPING);
    sidecar.shutdown();
    Ok(())
}

/// List available GGUF model files in the models directory.
#[tauri::command(rename_all = "snake_case")]
pub fn list_local_models(app: tauri::AppHandle) -> AppResult<Vec<ModelFileInfo>> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(format!("Failed to resolve data dir: {e}")))?;
    let models_dir = data_dir.join("models").join("gguf");

    std::fs::create_dir_all(&models_dir).ok();

    let models = sidecar_service::find_model_files(&models_dir);

    Ok(models
        .iter()
        .map(|p| {
            let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
            ModelFileInfo {
                name: p
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string(),
                size_bytes: size,
                size_display: format_size(size),
            }
        })
        .collect())
}

#[derive(serde::Serialize)]
pub struct ModelFileInfo {
    pub name: String,
    pub size_bytes: u64,
    pub size_display: String,
}

fn format_size(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else {
        format!("{} KB", bytes / 1024)
    }
}
