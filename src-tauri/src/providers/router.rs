/*
 * Title: router.rs
 * Tech Stack: Rust
 * Description: Provider router that dispatches LLM requests to the active provider.
 * Important Details: The router holds a registry of configured providers and tracks
 *   which one is currently active. Switching providers is a single method call.
 *   Thread-safe via interior mutability (RwLock on active provider index).
 */

use std::sync::RwLock;

use super::traits::{ChatRequest, ChatResponse, LlmProvider, ProviderError};


pub struct ProviderRouter {
    providers: Vec<Box<dyn LlmProvider>>,
    active_index: RwLock<Option<usize>>,
}


impl ProviderRouter {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
            active_index: RwLock::new(None),
        }
    }

    /// Register a provider. Returns its index for later activation.
    pub fn register(&mut self, provider: Box<dyn LlmProvider>) -> usize {
        let index = self.providers.len();
        self.providers.push(provider);
        index
    }

    /// Set the active provider by index.
    pub fn set_active(&self, index: usize) -> Result<(), ProviderError> {
        if index >= self.providers.len() {
            return Err(ProviderError::Configuration(format!(
                "Provider index {index} out of range (have {})",
                self.providers.len()
            )));
        }

        let mut active = self.active_index.write().map_err(|_| {
            ProviderError::Configuration("Provider router lock poisoned".into())
        })?;

        *active = Some(index);
        Ok(())
    }

    /// Get the name of the currently active provider.
    pub fn active_name(&self) -> Option<String> {
        let active = self.active_index.read().ok()?;
        let idx = (*active)?;
        Some(self.providers[idx].name().to_string())
    }

    /// Send a chat completion request to the active provider.
    pub fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, ProviderError> {
        let active = self.active_index.read().map_err(|_| {
            ProviderError::NotAvailable("Provider router lock poisoned".into())
        })?;

        let idx = active.ok_or_else(|| {
            ProviderError::NotAvailable("No active provider. Select a model first.".into())
        })?;

        let provider = &self.providers[idx];

        if !provider.is_available() {
            return Err(ProviderError::NotAvailable(format!(
                "{} is not available",
                provider.name()
            )));
        }

        provider.chat_completion(request)
    }

    /// List all registered providers with their availability status.
    pub fn list_providers(&self) -> Vec<ProviderInfo> {
        let active_idx = self.active_index.read().ok().and_then(|a| *a);

        self.providers
            .iter()
            .enumerate()
            .map(|(i, p)| ProviderInfo {
                index: i,
                name: p.name().to_string(),
                is_local: p.is_local(),
                is_available: p.is_available(),
                is_active: active_idx == Some(i),
            })
            .collect()
    }
}


#[derive(Debug, serde::Serialize)]
pub struct ProviderInfo {
    pub index: usize,
    pub name: String,
    pub is_local: bool,
    pub is_available: bool,
    pub is_active: bool,
}
