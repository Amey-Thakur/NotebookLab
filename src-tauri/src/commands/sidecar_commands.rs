/*
 * Title: sidecar_commands.rs
 * Tech Stack: Rust, Tauri v2 Shell Plugin
 * Description: Tauri commands for managing the llama-server sidecar process.
 *   Exposes start, stop, and status endpoints to the frontend.
 * Important Details: The sidecar is started via Tauri's shell plugin which resolves
 *   the binary from the app bundle. Health is polled on a background thread after
 *   spawn. When ready, it auto-registers as a provider in the ProviderRouter.
 */

use tauri::{Manager, State};
use tauri_plugin_shell::ShellExt;

use crate::error::{AppError, AppResult};
use crate::providers::openai_compatible::OpenAiCompatibleProvider;
use crate::services::sidecar_service::{self, SidecarManager, SidecarStatusInfo};
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
    _app_state: State<'_, AppState>,
    model_path: Option<String>,
) -> AppResult<SidecarStatusInfo> {
    /* Don't start if already running */
    if sidecar.is_running() {
        return Ok(SidecarStatusInfo {
            state: sidecar.current_state(),
            port: sidecar.port(),
            model_path: sidecar.model_path(),
            pid: sidecar.pid(),
        });
    }

    /* Resolve model path */
    let model = match model_path {
        Some(p) if !p.is_empty() => std::path::PathBuf::from(p),
        _ => {
            /* Scan default models directory */
            let data_dir = app.path().app_data_dir()
                .map_err(|e| AppError::Internal(format!("Failed to resolve data dir: {e}")))?;
            let models_dir = data_dir.join("models").join("gguf");

            let models = sidecar_service::find_model_files(&models_dir);
            models.into_iter().next().ok_or_else(|| {
                AppError::InvalidInput(format!(
                    "No GGUF model files found in {}. Download a model first.",
                    models_dir.display()
                ))
            })?
        }
    };

    if !model.exists() {
        return Err(AppError::InvalidInput(format!(
            "Model file not found: {}",
            model.display()
        )));
    }

    let model_str = model.to_string_lossy().to_string();

    /* Allocate port and generate API key */
    let port = sidecar_service::find_available_port();
    let api_key = sidecar_service::generate_session_key();

    sidecar.set_state(1); /* Starting */
    sidecar.set_port(port);
    sidecar.set_api_key(api_key.clone());
    sidecar.set_model_path(model_str.clone());

    tracing::info!("Starting llama-server on port {port} with model {model_str}");

    /* Build sidecar command via Tauri shell plugin */
    let args = sidecar_service::build_sidecar_args(port, &model_str);

    let sidecar_cmd = app.shell().sidecar("llama-server")
        .map_err(|e| AppError::Internal(format!("Failed to resolve sidecar binary: {e}")))?;

    let sidecar_cmd = sidecar_cmd.args(args)
        .env(sidecar_service::api_key_env_var(), &api_key);

    /* Spawn the process */
    let (mut rx, child) = sidecar_cmd.spawn()
        .map_err(|e| AppError::Internal(format!("Failed to spawn llama-server: {e}")))?;

    let child_pid = child.pid();
    sidecar.set_pid(child_pid);

    tracing::info!("llama-server spawned (PID: {child_pid})");

    /* Background thread: wait for ready, then register as provider */
    let handle = app.clone();
    std::thread::spawn(move || {
        /* Read stdout/stderr in background to prevent pipe buffer deadlock */
        while let Some(event) = rx.blocking_recv() {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    tracing::debug!("llama-server: {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    tracing::debug!("llama-server stderr: {}", String::from_utf8_lossy(&line));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(status) => {
                    tracing::warn!("llama-server exited: {:?}", status);
                    let mgr: State<'_, SidecarManager> = handle.state();
                    mgr.set_state(3); /* Crashed */
                    mgr.set_pid(0);
                    break;
                }
                _ => {}
            }
        }
    });

    /* Background thread: poll health and register provider when ready */
    let handle2 = app.clone();
    let model_name = model.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("local-model")
        .to_string();

    std::thread::spawn(move || {
        /* Wait up to 120 seconds for the model to load (large models are slow) */
        let ready = sidecar_service::wait_for_ready(port, 120);

        let mgr: State<'_, SidecarManager> = handle2.state();
        if ready {
            mgr.set_state(2); /* Ready */
            tracing::info!("llama-server ready on port {port}");

            /* Register as a provider so chat/RAG can use it */
            let state: State<'_, AppState> = handle2.state();
            if let Ok(mut providers) = state.provider() {
                let provider = OpenAiCompatibleProvider::new(
                    "llama.cpp (sidecar)".to_string(),
                    format!("http://127.0.0.1:{port}"),
                    None,
                    model_name,
                    true,
                );
                let provider_box: Box<dyn crate::providers::traits::LlmProvider> = Box::new(provider);
                let index = providers.register(provider_box);
                if providers.set_active(index).is_ok() {
                    tracing::info!("Sidecar auto-activated as provider (index {index})");
                }
            };
        } else {
            tracing::error!("llama-server failed to become ready within 120s");
            mgr.set_state(3); /* Crashed */
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

    sidecar.set_state(4); /* Stopping */
    let pid = sidecar.pid();

    tracing::info!("Stopping llama-server (PID: {pid})");

    /* Kill the process by PID. Platform-specific commands. */
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill")
            .arg(pid.to_string())
            .output();
    }

    sidecar.set_state(0); /* Stopped */
    sidecar.set_pid(0);
    sidecar.set_port(0);

    tracing::info!("llama-server stopped");
    Ok(())
}


/// List available GGUF model files in the models directory.
#[tauri::command]
pub fn list_local_models(app: tauri::AppHandle) -> AppResult<Vec<ModelFileInfo>> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Internal(format!("Failed to resolve data dir: {e}")))?;
    let models_dir = data_dir.join("models").join("gguf");

    /* Create dir if it doesn't exist so the user can see where to put models */
    std::fs::create_dir_all(&models_dir).ok();

    let models = sidecar_service::find_model_files(&models_dir);

    Ok(models.iter().map(|p| {
        let size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        ModelFileInfo {
            path: p.to_string_lossy().to_string(),
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
    pub path: String,
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
