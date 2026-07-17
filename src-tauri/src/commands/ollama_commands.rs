/*
 * Name: ollama_commands.rs
 * Purpose: Tauri commands for managing Ollama models from the Models page.
 * Description: Thin IPC wrappers over ollama_service. Status and listing are
 *   async because they probe the local server. Pulls run on a background
 *   thread and stream progress to the frontend via "ollama-pull-progress"
 *   events (mirroring the bundled model download's event pattern), guarded so
 *   only one pull runs at a time. All endpoints are the fixed loopback Ollama
 *   address; nothing here takes a URL from the frontend.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::Emitter;

use crate::error::{AppError, AppResult};
use crate::services::ollama_service::{self, OllamaModel, OllamaStatus, PullProgress};

/// One pull at a time: parallel pulls thrash disk and bandwidth, and the UI
/// shows a single progress bar.
static PULL_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Terminal event emitted after a pull ends, success or failure.
#[derive(Clone, serde::Serialize)]
struct PullFinished {
    model: String,
    ok: bool,
    error: Option<String>,
}

/// Is Ollama installed and running, and which version?
#[tauri::command(rename_all = "snake_case")]
pub async fn ollama_status() -> AppResult<OllamaStatus> {
    tauri::async_runtime::spawn_blocking(ollama_service::status)
        .await
        .map_err(|e| AppError::Internal(format!("Status task failed: {e}")))
}

/// Locally installed Ollama models with their disk sizes.
#[tauri::command(rename_all = "snake_case")]
pub async fn ollama_installed_models() -> AppResult<Vec<OllamaModel>> {
    tauri::async_runtime::spawn_blocking(ollama_service::installed_models)
        .await
        .map_err(|e| AppError::Internal(format!("List task failed: {e}")))?
}

/// Start pulling a model. Returns immediately; progress arrives via
/// "ollama-pull-progress" events and the end via "ollama-pull-finished".
#[tauri::command(rename_all = "snake_case")]
pub fn ollama_pull_model(app: tauri::AppHandle, model: String) -> AppResult<()> {
    ollama_service::validate_model_name(&model)?;

    if PULL_IN_PROGRESS
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err(AppError::InvalidInput(
            "A model download is already in progress".into(),
        ));
    }

    std::thread::spawn(move || {
        let result = ollama_service::pull_model(&model, |progress: PullProgress| {
            app.emit("ollama-pull-progress", &progress).ok();
        });

        let (ok, error) = match &result {
            Ok(()) => (true, None),
            Err(e) => (false, Some(e.to_string())),
        };
        app.emit(
            "ollama-pull-finished",
            PullFinished {
                model: model.clone(),
                ok,
                error,
            },
        )
        .ok();

        if let Err(e) = result {
            tracing::warn!("Ollama pull failed for {model}: {e}");
        } else {
            tracing::info!("Ollama pull complete: {model}");
        }

        PULL_IN_PROGRESS.store(false, Ordering::Release);
    });

    Ok(())
}

/// Remove an installed model from disk.
#[tauri::command(rename_all = "snake_case")]
pub async fn ollama_delete_model(model: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || ollama_service::delete_model(&model))
        .await
        .map_err(|e| AppError::Internal(format!("Delete task failed: {e}")))?
}
