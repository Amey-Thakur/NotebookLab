/*
 * Name: download_commands.rs
 * Purpose: Commands for downloading GGUF model files from HuggingFace Hub.
 * Description: Reports progress via Tauri events so the frontend can show a
 *   progress bar. Downloads are streamed to disk in 64KB chunks.
 *   Progress events are emitted every 1% or every 500ms (whichever
 *   comes first). The download directory is
 *   $APP_DATA/models/gguf/. Only huggingface.co URLs are allowed.
 *   A guard prevents concurrent downloads. Temp files are cleaned
 *   up on failure.
 * Tech Stack: Rust, Tauri v2, reqwest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Emitter, Manager};

use crate::error::{AppError, AppResult};

/// Default model for first-launch: small enough for 8GB RAM, good quality.
const DEFAULT_MODEL_URL: &str =
    "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf";
const DEFAULT_MODEL_NAME: &str = "Llama-3.2-3B-Instruct-Q4_K_M.gguf";

/// One bundled-server model the user can download in a click.
#[derive(Clone, serde::Serialize)]
pub struct GgufCatalogEntry {
    pub id: &'static str,
    pub label: &'static str,
    pub params: &'static str,
    pub filename: &'static str,
    /// Verified download size in GB (from the hosting file's content-length).
    pub download_gb: f64,
    pub min_ram_gb: u32,
    pub recommended_ram_gb: u32,
    pub use_note: &'static str,
    #[serde(skip)]
    url: &'static str,
}

/// Curated GGUF models for the bundled llama.cpp server. Every URL was
/// verified live (HTTP 200) with its size read from the response headers, so
/// each entry downloads exactly what it promises. All are Q4_K_M quantized
/// builds from Hugging Face, small enough for consumer hardware; the catalog
/// stays ordered small to large so the recommendation logic can walk it.
const GGUF_CATALOG: &[GgufCatalogEntry] = &[
    GgufCatalogEntry {
        id: "llama-3.2-1b",
        label: "Llama 3.2",
        params: "1B",
        filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
        download_gb: 0.75,
        min_ram_gb: 4,
        recommended_ram_gb: 8,
        use_note: "The lightest start; quick answers on older machines.",
        url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    },
    GgufCatalogEntry {
        id: "llama-3.2-3b",
        label: "Llama 3.2",
        params: "3B",
        filename: DEFAULT_MODEL_NAME,
        download_gb: 1.88,
        min_ram_gb: 8,
        recommended_ram_gb: 8,
        use_note: "The dependable starter: capable and light on memory.",
        url: DEFAULT_MODEL_URL,
    },
    GgufCatalogEntry {
        id: "gemma-3-4b",
        label: "Gemma 3",
        params: "4B",
        filename: "google_gemma-3-4b-it-Q4_K_M.gguf",
        download_gb: 2.32,
        min_ram_gb: 8,
        recommended_ram_gb: 16,
        use_note: "Google's compact all-rounder with clean writing.",
        url: "https://huggingface.co/bartowski/google_gemma-3-4b-it-GGUF/resolve/main/google_gemma-3-4b-it-Q4_K_M.gguf",
    },
    GgufCatalogEntry {
        id: "phi-4-mini",
        label: "Phi-4 Mini",
        params: "3.8B",
        filename: "microsoft_Phi-4-mini-instruct-Q4_K_M.gguf",
        download_gb: 2.32,
        min_ram_gb: 8,
        recommended_ram_gb: 16,
        use_note: "Microsoft's small model tuned for logic and math.",
        url: "https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/microsoft_Phi-4-mini-instruct-Q4_K_M.gguf",
    },
    GgufCatalogEntry {
        id: "qwen3-4b",
        label: "Qwen 3",
        params: "4B",
        filename: "Qwen_Qwen3-4B-Q4_K_M.gguf",
        download_gb: 2.33,
        min_ram_gb: 8,
        recommended_ram_gb: 16,
        use_note: "Punches above its size on reasoning and long documents.",
        url: "https://huggingface.co/bartowski/Qwen_Qwen3-4B-GGUF/resolve/main/Qwen_Qwen3-4B-Q4_K_M.gguf",
    },
    GgufCatalogEntry {
        id: "mistral-7b",
        label: "Mistral",
        params: "7B",
        filename: "Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
        download_gb: 4.07,
        min_ram_gb: 16,
        recommended_ram_gb: 16,
        use_note: "A proven, efficient classic with a direct style.",
        url: "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
    },
    GgufCatalogEntry {
        id: "qwen2.5-coder-7b",
        label: "Qwen 2.5 Coder",
        params: "7B",
        filename: "Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
        download_gb: 4.36,
        min_ram_gb: 16,
        recommended_ram_gb: 16,
        use_note: "Purpose-built for code: completion and explanation.",
        url: "https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf",
    },
    GgufCatalogEntry {
        id: "deepseek-r1-7b",
        label: "DeepSeek R1 Distill",
        params: "7B",
        filename: "DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf",
        download_gb: 4.36,
        min_ram_gb: 16,
        recommended_ram_gb: 16,
        use_note: "Deliberate step-by-step reasoning, fully offline. Thinks before answering, so replies take minutes on CPU; pick a smaller model for quick answers.",
        url: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf",
    },
];

/// The curated bundled-server catalog for the Models page.
#[tauri::command(rename_all = "snake_case")]
pub fn list_gguf_catalog() -> Vec<GgufCatalogEntry> {
    GGUF_CATALOG.to_vec()
}

/// Download a catalog model by id. Progress arrives on the same
/// "model-download-progress" events as the default download, keyed by
/// filename, and the same single-download guard applies.
#[tauri::command(rename_all = "snake_case")]
pub fn download_gguf_model(app: tauri::AppHandle, id: String) -> AppResult<String> {
    let entry = GGUF_CATALOG
        .iter()
        .find(|e| e.id == id)
        .ok_or_else(|| AppError::InvalidInput(format!("Unknown model id: {id}")))?;
    download_model(
        app,
        Some(entry.url.to_string()),
        Some(entry.filename.to_string()),
    )
}

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
/// Internal helper behind download_default_model; not exposed over IPC because
/// no interface offers custom model URLs yet.
fn download_model(
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
