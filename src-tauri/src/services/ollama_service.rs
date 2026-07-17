/*
 * Name: ollama_service.rs
 * Purpose: Talk to a local Ollama install: status, model list, pulls, deletes.
 * Description: Uses Ollama's native API on the fixed loopback endpoint
 *   (127.0.0.1:11434) rather than its OpenAI-compatible shim, because model
 *   management (pull with progress, delete, disk sizes) only exists on the
 *   native API. Pulls stream NDJSON progress lines which are forwarded to a
 *   callback; the HTTP client for pulls has no overall timeout since a large
 *   model can download for an hour. Model names are validated against the
 *   characters Ollama tags actually use before being sent anywhere.
 * Tech Stack: Rust, reqwest, serde
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

use std::io::{BufRead, BufReader};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// Ollama's fixed local endpoint. Never user-supplied, so these commands are
/// not an SSRF surface.
pub const OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434";

#[derive(Debug, Clone, Serialize)]
pub struct OllamaStatus {
    /// The local server answered the version probe.
    pub running: bool,
    /// The binary exists on PATH (or the server answered), even if not running.
    pub installed: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OllamaModel {
    pub name: String,
    pub size_bytes: u64,
    pub parameter_size: Option<String>,
    pub quantization: Option<String>,
    pub family: Option<String>,
}

/// One NDJSON line of pull progress, forwarded to the frontend as an event.
#[derive(Debug, Clone, Serialize)]
pub struct PullProgress {
    pub model: String,
    pub status: String,
    pub total: u64,
    pub completed: u64,
    pub percent: f64,
    pub done: bool,
}

fn probe_client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(4))
        .connect_timeout(Duration::from_millis(800))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new())
}

/// Whether the server is running and, when it is not, whether the binary is
/// at least installed so the UI can say "start it" instead of "install it".
pub fn status() -> OllamaStatus {
    let version = probe_client()
        .get(format!("{OLLAMA_BASE_URL}/api/version"))
        .send()
        .ok()
        .filter(|r| r.status().is_success())
        .and_then(|r| r.json::<serde_json::Value>().ok())
        .and_then(|v| v.get("version")?.as_str().map(str::to_string));

    if version.is_some() {
        return OllamaStatus {
            running: true,
            installed: true,
            version,
        };
    }

    OllamaStatus {
        running: false,
        installed: binary_on_path(),
        version: None,
    }
}

/// Check for the ollama binary without popping a console window on Windows.
fn binary_on_path() -> bool {
    let mut command = std::process::Command::new("ollama");
    command
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.status().map(|s| s.success()).unwrap_or(false)
}

/// Models installed locally, with their on-disk sizes.
pub fn installed_models() -> AppResult<Vec<OllamaModel>> {
    #[derive(Deserialize)]
    struct TagsResponse {
        #[serde(default)]
        models: Vec<TagEntry>,
    }
    #[derive(Deserialize)]
    struct TagEntry {
        name: String,
        #[serde(default)]
        size: u64,
        details: Option<TagDetails>,
    }
    #[derive(Deserialize)]
    struct TagDetails {
        parameter_size: Option<String>,
        quantization_level: Option<String>,
        family: Option<String>,
    }

    let response = probe_client()
        .get(format!("{OLLAMA_BASE_URL}/api/tags"))
        .send()
        .map_err(|_| AppError::Provider("Ollama is not running".into()))?;

    if !response.status().is_success() {
        return Err(AppError::Provider(format!(
            "Ollama answered with HTTP {}",
            response.status()
        )));
    }

    let tags: TagsResponse = response
        .json()
        .map_err(|e| AppError::Provider(format!("Unexpected Ollama response: {e}")))?;

    Ok(tags
        .models
        .into_iter()
        .map(|m| OllamaModel {
            name: m.name,
            size_bytes: m.size,
            parameter_size: m.details.as_ref().and_then(|d| d.parameter_size.clone()),
            quantization: m
                .details
                .as_ref()
                .and_then(|d| d.quantization_level.clone()),
            family: m.details.as_ref().and_then(|d| d.family.clone()),
        })
        .collect())
}

/// Pull a model, forwarding each progress line to the callback. Blocks until
/// the pull finishes or fails, so callers run it on a background thread.
pub fn pull_model(model: &str, mut on_progress: impl FnMut(PullProgress)) -> AppResult<()> {
    validate_model_name(model)?;

    #[derive(Deserialize)]
    struct PullLine {
        status: Option<String>,
        error: Option<String>,
        #[serde(default)]
        total: u64,
        #[serde(default)]
        completed: u64,
    }

    /* No overall timeout: a large model legitimately downloads for a long
    time. The connect timeout still fails fast when Ollama is not running. */
    let client = reqwest::blocking::Client::builder()
        .timeout(None)
        .connect_timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| AppError::Internal(format!("HTTP client build failed: {e}")))?;

    let response = client
        .post(format!("{OLLAMA_BASE_URL}/api/pull"))
        .json(&serde_json::json!({ "model": model, "stream": true }))
        .send()
        .map_err(|_| AppError::Provider("Ollama is not running".into()))?;

    if !response.status().is_success() {
        return Err(AppError::Provider(format!(
            "Ollama answered with HTTP {}",
            response.status()
        )));
    }

    let reader = BufReader::new(response);
    for line in reader.lines() {
        let line = line.map_err(|e| AppError::Provider(format!("Download interrupted: {e}")))?;
        if line.trim().is_empty() {
            continue;
        }
        let parsed: PullLine = match serde_json::from_str(&line) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };

        if let Some(error) = parsed.error {
            return Err(AppError::Provider(format!("Ollama: {error}")));
        }

        let status = parsed.status.unwrap_or_default();
        let done = status == "success";
        let percent = if parsed.total > 0 {
            (parsed.completed as f64 / parsed.total as f64 * 100.0).min(100.0)
        } else if done {
            100.0
        } else {
            0.0
        };

        on_progress(PullProgress {
            model: model.to_string(),
            status,
            total: parsed.total,
            completed: parsed.completed,
            percent,
            done,
        });

        if done {
            return Ok(());
        }
    }

    Err(AppError::Provider(
        "Download ended before Ollama reported success".into(),
    ))
}

/// Remove an installed model from disk.
pub fn delete_model(model: &str) -> AppResult<()> {
    validate_model_name(model)?;

    let response = probe_client()
        .delete(format!("{OLLAMA_BASE_URL}/api/delete"))
        .json(&serde_json::json!({ "model": model }))
        .send()
        .map_err(|_| AppError::Provider("Ollama is not running".into()))?;

    if !response.status().is_success() {
        return Err(AppError::Provider(format!(
            "Ollama could not delete the model (HTTP {})",
            response.status()
        )));
    }
    Ok(())
}

/// Ollama tags are name[:tag] with optional registry paths: letters, digits,
/// and . _ - : /. Anything else is rejected before reaching the API.
pub fn validate_model_name(model: &str) -> AppResult<()> {
    if model.is_empty() || model.len() > 200 {
        return Err(AppError::InvalidInput(
            "Model name is required (max 200 chars)".into(),
        ));
    }
    let valid = model
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ':' | '/'));
    if !valid {
        return Err(AppError::InvalidInput(
            "Model name contains unsupported characters".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_model_name;

    #[test]
    fn accepts_real_ollama_tags() {
        assert!(validate_model_name("llama3.2:3b").is_ok());
        assert!(validate_model_name("qwen2.5-coder:7b").is_ok());
        assert!(validate_model_name("hf.co/user/repo:Q4_K_M").is_ok());
    }

    #[test]
    fn rejects_whitespace_and_empty() {
        assert!(validate_model_name("").is_err());
        assert!(validate_model_name("llama 3").is_err());
        assert!(validate_model_name("bad\nname").is_err());
    }
}
