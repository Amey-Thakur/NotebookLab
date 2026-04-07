/*
 * Title: sidecar_commands.rs
 * Tech Stack: Rust, Tauri v2 Shell Plugin
 * Description: Tauri commands for managing the llama-server sidecar process.
 *   Exposes start, stop, and status endpoints to the frontend.
 * Important Details: Uses atomic compare-exchange to prevent double-start races.
 *   A cancellation flag is shared between the stdout-reader and health-poller
 *   threads so the poller aborts immediately when the process exits. The API key
 *   is passed to the provider registration so auth works end-to-end.
 */

use std::sync::atomic::Ordering;

use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::error::{AppError, AppResult};
use crate::providers::openai_compatible::OpenAiCompatibleProvider;
use crate::services::sidecar_service::{self, SidecarManager, SidecarStatusInfo, STATE_STOPPED, STATE_STARTING};
use crate::state::AppState;


/// Check if the sidecar binary exists in the app bundle.
#[tauri::command]
pub fn sidecar_available(app: tauri::AppHandle) -> AppResult<bool> {
    let available = app.shell().sidecar("llama-server").is_ok();
    Ok(available)
}


/// Get current sidecar status for the frontend UI.
#[tauri::command]
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
#[tauri::command]
pub fn start_sidecar(
    app: tauri::AppHandle,
    sidecar: State<'_, SidecarManager>,
    model_path: Option<String>,
) -> AppResult<SidecarStatusInfo> {
    /* Atomic transition: STOPPED -> STARTING. Prevents double-start race. */
    if !sidecar.try_transition(STATE_STOPPED, STATE_STARTING) {
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
    let data_dir = app.path().app_data_dir()
        .map_err(|e| {
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

    let sidecar_cmd = app.shell().sidecar("llama-server")
        .map_err(|e| {
            sidecar.set_state(STATE_STOPPED);
            AppError::Internal(format!("Failed to resolve sidecar binary: {e}"))
        })?;

    let sidecar_cmd = sidecar_cmd.args(args)
        .env(sidecar_service::api_key_env_var(), &api_key);

    /* Spawn the process */
    let (mut rx, child) = sidecar_cmd.spawn()
        .map_err(|e| {
            sidecar.set_state(STATE_STOPPED);
            AppError::Internal(format!("Failed to spawn llama-server: {e}"))
        })?;

    let child_pid = child.pid();
    /* Update PID under the existing lock set by configure() */
    {
        let mut inner = sidecar.inner_lock();
        inner.pid = child_pid;
    }

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
                    tracing::warn!("llama-server exited: {:?}", status);
                    let mgr: State<'_, SidecarManager> = handle.state();
                    mgr.cancelled.store(true, Ordering::Release);
                    mgr.set_state(sidecar_service::STATE_CRASHED);
                    {
                        let mut inner = mgr.inner_lock();
                        inner.pid = 0;
                    }
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
    let model_name = model.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("local-model")
        .to_string();

    std::thread::spawn(move || {
        let mgr: State<'_, SidecarManager> = handle2.state();

        /* Wait up to 120 seconds, but abort early if process exits */
        let ready = sidecar_service::wait_for_ready(port, 120, &mgr.cancelled);

        if ready {
            mgr.set_state(sidecar_service::STATE_READY);
            tracing::info!("llama-server ready on port {port}");

            /* Register as provider with the API key for auth */
            let state: State<'_, AppState> = handle2.state();
            if let Ok(mut providers) = state.provider() {
                let provider = OpenAiCompatibleProvider::new(
                    "llama.cpp (sidecar)".to_string(),
                    format!("http://127.0.0.1:{port}"),
                    Some(api_key_for_provider),
                    model_name,
                    true,
                );
                let provider_box: Box<dyn crate::providers::traits::LlmProvider> = Box::new(provider);
                let index = providers.register(provider_box);
                if providers.set_active(index).is_ok() {
                    tracing::info!("Sidecar auto-activated as provider (index {index})");
                }
            };
        } else if !mgr.cancelled.load(Ordering::Acquire) {
            /* Only set crashed if it wasn't already set by the termination handler */
            tracing::error!("llama-server failed to become ready within 120s");
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


/// Stop the running sidecar process.
#[tauri::command]
pub fn stop_sidecar(
    sidecar: State<'_, SidecarManager>,
) -> AppResult<()> {
    if !sidecar.is_running() {
        return Ok(());
    }

    sidecar.set_state(sidecar_service::STATE_STOPPING);
    let pid = sidecar.pid();

    if pid == 0 {
        sidecar.set_state(STATE_STOPPED);
        sidecar.clear();
        return Ok(());
    }

    tracing::info!("Stopping llama-server (PID: {pid})");

    /* Kill the process by PID. Platform-specific commands. */
    #[cfg(target_os = "windows")]
    {
        let result = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output();
        if let Err(e) = result {
            tracing::warn!("taskkill failed: {e}");
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let result = std::process::Command::new("kill")
            .arg(pid.to_string())
            .output();
        if let Err(e) = result {
            tracing::warn!("kill failed: {e}");
        }
    }

    /* Signal cancellation so background threads clean up */
    sidecar.cancelled.store(true, Ordering::Release);
    sidecar.set_state(STATE_STOPPED);
    sidecar.clear();

    tracing::info!("llama-server stopped");
    Ok(())
}


/// List available GGUF model files in the models directory.
#[tauri::command]
pub fn list_local_models(app: tauri::AppHandle) -> AppResult<Vec<ModelFileInfo>> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Internal(format!("Failed to resolve data dir: {e}")))?;
    let models_dir = data_dir.join("models").join("gguf");

    std::fs::create_dir_all(&models_dir).ok();

    let models = sidecar_service::find_model_files(&models_dir);

    Ok(models.iter().map(|p| {
        let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        ModelFileInfo {
            name: p.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string(),
            size_bytes: size,
            size_display: format_size(size),
        }
    }).collect())
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
