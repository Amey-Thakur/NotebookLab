/*
 * Title: download_commands.rs
 * Tech Stack: Rust, Tauri v2, reqwest
 * Description: Commands for downloading GGUF model files from HuggingFace Hub.
 *   Reports progress via Tauri events so the frontend can show a progress bar.
 * Important Details: Downloads are streamed to disk in 64KB chunks. Progress events
 *   are emitted every 1% or every 500ms (whichever comes first). The download
 *   directory is $APP_DATA/models/gguf/. Only huggingface.co URLs are allowed.
 *   A guard prevents concurrent downloads. Temp files are cleaned up on failure.
 */

use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Emitter, Manager};

use crate::error::{AppError, AppResult};

/// Default model for first-launch: small enough for 8GB RAM, good quality.
const DEFAULT_MODEL_URL: &str =
    "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf";
const DEFAULT_MODEL_NAME: &str = "Llama-3.2-3B-Instruct-Q4_K_M.gguf";

/// Allowed download hosts. Only trusted model repositories.
const ALLOWED_HOSTS: &[&str] = &["huggingface.co"];

/// Global download guard: prevents concurrent downloads.
static DOWNLOAD_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Progress event emitted to the frontend during download.
#[derive(Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub model_name: String,
    pub status: String, /* "downloading", "complete", "error" */
}

/// Download the default model for first-launch experience.
/// Returns immediately; progress is reported via events.
#[tauri::command(rename_all = "snake_case")]
pub fn download_default_model(app: tauri::AppHandle) -> AppResult<String> {
    download_model(app, None, None)
}

/// Download a GGUF model from a URL. If url is None, uses the default model.
/// Progress is reported via "model-download-progress" Tauri events.
/// Returns the expected output path (file may not exist yet if download is async).
#[tauri::command(rename_all = "snake_case")]
pub fn download_model(
    app: tauri::AppHandle,
    url: Option<String>,
    filename: Option<String>,
) -> AppResult<String> {
    /* Prevent concurrent downloads */
    if DOWNLOAD_IN_PROGRESS
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err(AppError::InvalidInput(
            "A download is already in progress".into(),
        ));
    }

    let download_url = url.as_deref().unwrap_or(DEFAULT_MODEL_URL);

    /* Sanitize filename: reject path separators and traversal */
    let model_name = filename.as_deref().unwrap_or(DEFAULT_MODEL_NAME);
    if model_name.contains('/') || model_name.contains('\\') || model_name.contains("..") {
        DOWNLOAD_IN_PROGRESS.store(false, Ordering::Release);
        return Err(AppError::InvalidInput(
            "Invalid filename: must not contain path separators".into(),
        ));
    }

    /* Validate URL: must be HTTPS and from an allowed host */
    if !download_url.starts_with("https://") {
        DOWNLOAD_IN_PROGRESS.store(false, Ordering::Release);
        return Err(AppError::InvalidInput(
            "Model download URL must use HTTPS".into(),
        ));
    }

    let host = download_url
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("");

    if !ALLOWED_HOSTS
        .iter()
        .any(|h| host == *h || host.ends_with(&format!(".{h}")))
    {
        DOWNLOAD_IN_PROGRESS.store(false, Ordering::Release);
        return Err(AppError::InvalidInput(format!(
            "Downloads only allowed from: {}",
            ALLOWED_HOSTS.join(", ")
        )));
    }

    /* Resolve output path */
    let data_dir = app.path().app_data_dir().map_err(|e| {
        DOWNLOAD_IN_PROGRESS.store(false, Ordering::Release);
        AppError::Internal(format!("Failed to resolve data dir: {e}"))
    })?;
    let models_dir = data_dir.join("models").join("gguf");
    std::fs::create_dir_all(&models_dir).map_err(|e| {
        DOWNLOAD_IN_PROGRESS.store(false, Ordering::Release);
        AppError::Internal(format!("Failed to create models dir: {e}"))
    })?;

    let output_path = models_dir.join(model_name);

    /* Clean up any stale .downloading temp files from previous failed attempts */
    cleanup_temp_files(&models_dir);

    /* Skip if already downloaded (file exists with .gguf extension and non-zero size) */
    if output_path.exists() {
        let size = std::fs::metadata(&output_path)
            .map(|m| m.len())
            .unwrap_or(0);
        if size > 0 {
            DOWNLOAD_IN_PROGRESS.store(false, Ordering::Release);
            tracing::info!(
                "Model already exists: {} ({} MB)",
                model_name,
                size / 1_048_576
            );
            app.emit(
                "model-download-progress",
                DownloadProgress {
                    downloaded: size,
                    total: size,
                    percent: 100.0,
                    model_name: model_name.to_string(),
                    status: "complete".to_string(),
                },
            )
            .ok();
            return Ok(output_path.to_string_lossy().to_string());
        }
    }

    tracing::info!("Downloading model: {model_name}");

    /* Start download on a background thread */
    let app_clone = app.clone();
    let url_owned = download_url.to_string();
    let name_owned = model_name.to_string();
    let path_owned = output_path.clone();

    std::thread::spawn(move || {
        let result = do_download(&app_clone, &url_owned, &name_owned, &path_owned);

        if let Err(e) = result {
            tracing::error!("Model download failed: {e}");

            /* Clean up partial temp file */
            let tmp_path = path_owned.with_extension("gguf.downloading");
            let _ = std::fs::remove_file(&tmp_path);

            app_clone
                .emit(
                    "model-download-progress",
                    DownloadProgress {
                        downloaded: 0,
                        total: 0,
                        percent: 0.0,
                        model_name: name_owned,
                        status: format!("error: {e}"),
                    },
                )
                .ok();
        }

        /* Release download guard */
        DOWNLOAD_IN_PROGRESS.store(false, Ordering::Release);
    });

    Ok(output_path.to_string_lossy().to_string())
}

/// Perform the actual download with progress reporting.
fn do_download(
    app: &tauri::AppHandle,
    url: &str,
    model_name: &str,
    output_path: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .connect_timeout(std::time::Duration::from_secs(30))
        .build()?;

    let response = client.get(url).send()?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()).into());
    }

    let total = response.content_length().unwrap_or(0);

    /* Write to a temp file first, rename on completion */
    let tmp_path = output_path.with_extension("gguf.downloading");
    let mut file = std::fs::File::create(&tmp_path)?;

    let mut downloaded: u64 = 0;
    let mut last_report = std::time::Instant::now();
    let mut last_percent: f64 = 0.0;

    let mut reader = response;
    let mut buf = vec![0u8; 65536];

    loop {
        let bytes_read = std::io::Read::read(&mut reader, &mut buf)?;
        if bytes_read == 0 {
            break;
        }

        file.write_all(&buf[..bytes_read])?;
        downloaded += bytes_read as u64;

        let percent = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0).min(100.0)
        } else {
            0.0
        };

        let elapsed = last_report.elapsed();
        if percent - last_percent >= 1.0 || elapsed.as_millis() >= 500 {
            app.emit(
                "model-download-progress",
                DownloadProgress {
                    downloaded,
                    total,
                    percent,
                    model_name: model_name.to_string(),
                    status: "downloading".to_string(),
                },
            )
            .ok();
            last_report = std::time::Instant::now();
            last_percent = percent;
        }
    }

    file.flush()?;
    drop(file);

    /* Rename temp file to final name */
    std::fs::rename(&tmp_path, output_path)?;

    tracing::info!(
        "Model download complete: {} ({} MB)",
        model_name,
        downloaded / 1_048_576
    );

    app.emit(
        "model-download-progress",
        DownloadProgress {
            downloaded,
            total: downloaded,
            percent: 100.0,
            model_name: model_name.to_string(),
            status: "complete".to_string(),
        },
    )
    .ok();

    Ok(())
}

/// Clean up stale .downloading temp files from previous failed attempts.
fn cleanup_temp_files(models_dir: &std::path::Path) {
    if let Ok(entries) = std::fs::read_dir(models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("downloading") {
                tracing::debug!("Cleaning up stale temp file: {}", path.display());
                let _ = std::fs::remove_file(&path);
            }
        }
    }
}

/// Check if a model file exists and is likely complete.
#[tauri::command(rename_all = "snake_case")]
pub fn has_local_model(app: tauri::AppHandle) -> AppResult<bool> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Internal(format!("Failed to resolve data dir: {e}")))?;
    let models_dir = data_dir.join("models").join("gguf");

    let models = crate::services::sidecar_service::find_model_files(&models_dir);
    Ok(!models.is_empty())
}
