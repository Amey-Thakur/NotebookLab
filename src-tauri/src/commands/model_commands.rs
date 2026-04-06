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
    if input.name.trim().is_empty() {
        return Err(AppError::InvalidInput("Provider name is required".into()));
    }
    if input.base_url.trim().is_empty() {
        return Err(AppError::InvalidInput("Base URL is required".into()));
    }
    if input.model.trim().is_empty() {
        return Err(AppError::InvalidInput("Model name is required".into()));
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
pub fn get_model_registry(state: State<'_, AppState>) -> AppResult<serde_json::Value> {
    let registry = include_str!("../../resources/model-registry.json");
    let value: serde_json::Value = serde_json::from_str(registry)?;
    Ok(value)
}
