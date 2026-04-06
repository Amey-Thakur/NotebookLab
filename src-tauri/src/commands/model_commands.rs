/*
 * Title: model_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri commands for managing LLM providers and models at runtime.
 * Important Details: Allows the frontend to register local (llama.cpp, Ollama) and
 *   cloud (OpenAI, Anthropic) providers dynamically. The active provider can be
 *   switched without restarting the app. Provider state lives in ProviderRouter.
 */

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::providers::{openai_compatible::OpenAiCompatibleProvider, ProviderInfo};
use crate::state::AppState;


#[derive(serde::Deserialize)]
pub struct RegisterProviderInput {
    pub name: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub model: String,
    pub is_local: bool,
}


#[tauri::command]
pub fn list_providers(state: State<'_, AppState>) -> AppResult<Vec<ProviderInfo>> {
    let providers = state.provider()?;
    Ok(providers.list_providers())
}


#[tauri::command]
pub fn register_provider(
    state: State<'_, AppState>,
    input: RegisterProviderInput,
) -> AppResult<usize> {
    if input.name.trim().is_empty() || input.name.len() > 200 {
        return Err(AppError::InvalidInput("Provider name is required (max 200 chars)".into()));
    }
    if input.base_url.trim().is_empty() || input.base_url.len() > 2000 {
        return Err(AppError::InvalidInput("Base URL is required (max 2000 chars)".into()));
    }
    if input.model.trim().is_empty() || input.model.len() > 200 {
        return Err(AppError::InvalidInput("Model name is required (max 200 chars)".into()));
    }

    /* Validate URL scheme and host to prevent SSRF */
    validate_provider_url(&input.base_url, input.is_local)?;

    /* Reject sending API keys over unencrypted HTTP to remote providers */
    if input.api_key.is_some() && !input.is_local && !input.base_url.starts_with("https://") {
        return Err(AppError::InvalidInput(
            "API keys can only be sent to HTTPS endpoints for cloud providers".into(),
        ));
    }

    let provider = OpenAiCompatibleProvider::new(
        input.name,
        input.base_url,
        input.api_key,
        input.model,
        input.is_local,
    );

    let mut providers = state.provider()?;
    let index = providers.register(Box::new(provider));

    tracing::info!("Registered provider at index {index}");
    Ok(index)
}


#[tauri::command]
pub fn set_active_provider(
    state: State<'_, AppState>,
    index: usize,
) -> AppResult<()> {
    let providers = state.provider()?;
    providers.set_active(index).map_err(|e| AppError::Provider(e.to_string()))
}


#[tauri::command]
pub fn get_active_provider_name(state: State<'_, AppState>) -> AppResult<Option<String>> {
    let providers = state.provider()?;
    Ok(providers.active_name())
}


#[tauri::command]
pub fn get_model_registry() -> AppResult<serde_json::Value> {
    let registry = include_str!("../../resources/model-registry.json");
    let value: serde_json::Value = serde_json::from_str(registry)?;
    Ok(value)
}


/// Validate provider URL to prevent SSRF attacks.
/// Local providers: must use loopback addresses only.
/// Cloud providers: must use https:// and not target private/internal networks.
fn validate_provider_url(url: &str, is_local: bool) -> AppResult<()> {
    /* Must start with http:// or https:// */
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(AppError::InvalidInput(
            "Provider URL must use http:// or https:// scheme".into(),
        ));
    }

    /* Extract host from URL */
    let host = url
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");

    if is_local {
        /* Local providers must target loopback only */
        let allowed = ["127.0.0.1", "localhost", "::1", "[::1]"];
        if !allowed.contains(&host) {
            return Err(AppError::InvalidInput(
                "Local providers must use 127.0.0.1 or localhost".into(),
            ));
        }
    } else {
        /* Cloud providers must not target private/internal networks */
        let blocked_prefixes = ["127.", "10.", "192.168.", "172.16.", "172.17.", "172.18.",
            "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
            "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
            "169.254.", "0.", "localhost", "::1", "[::1]"];

        for prefix in &blocked_prefixes {
            if host.starts_with(prefix) || host == *prefix {
                return Err(AppError::InvalidInput(
                    "Cloud providers cannot target private/internal networks".into(),
                ));
            }
        }
    }

    Ok(())
}
