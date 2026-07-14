/*
 * Name: router.rs
 * Purpose: Provider router that dispatches LLM requests to the active
 *   provider.
 * Description: The router holds a registry of configured providers and tracks
 *   which one is currently active. Switching providers is a single
 *   method call. Thread-safe via interior mutability (RwLock on
 *   active provider index).
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use std::sync::RwLock;

use super::traits::{ChatRequest, ChatResponse, LlmProvider, ProviderError};

pub struct ProviderRouter {
    providers: Vec<Box<dyn LlmProvider>>,
    active_index: RwLock<Option<usize>>,
}

impl Default for ProviderRouter {
    fn default() -> Self {
        Self::new()
    }
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

    /// Register a provider, replacing any existing provider with the same name.
    /// Keeps indexes stable so the frontend's index-based activation stays valid
    /// across sidecar restarts (which would otherwise accumulate duplicates).
    pub fn register_or_replace(&mut self, provider: Box<dyn LlmProvider>) -> usize {
        let name = provider.name().to_string();
        if let Some(index) = self.providers.iter().position(|p| p.name() == name) {
            self.providers[index] = provider;
            index
        } else {
            self.register(provider)
        }
    }

    /// Clear the active provider if it currently points at the named provider.
    /// Used when the sidecar stops so chat fails with a clear "no provider"
    /// message instead of a network error against a dead server.
    pub fn deactivate_if_named(&self, name: &str) {
        let Ok(mut active) = self.active_index.write() else {
            return;
        };
        if let Some(idx) = *active {
            if self
                .providers
                .get(idx)
                .map(|p| p.name() == name)
                .unwrap_or(false)
            {
                *active = None;
            }
        }
    }

    /// Set the active provider by index.
    pub fn set_active(&self, index: usize) -> Result<(), ProviderError> {
        if index >= self.providers.len() {
            return Err(ProviderError::Configuration(format!(
                "Provider index {index} out of range (have {})",
                self.providers.len()
            )));
        }

        let mut active = self
            .active_index
            .write()
            .map_err(|_| ProviderError::Configuration("Provider router lock poisoned".into()))?;

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
        let idx = self.active_index_snapshot()?;

        /* Availability check removed from hot path. The completion call itself
        will return a clear error if the provider is unreachable. Checking
        availability added ~100-300ms latency per request. */
        self.providers[idx].chat_completion(request)
    }

    /// Generate an embedding vector using the active provider.
    pub fn embed(&self, text: &str) -> Result<Option<Vec<f32>>, ProviderError> {
        let idx = self.active_index_snapshot()?;
        self.providers[idx].embed(text)
    }

    /// Read the active provider index and release the lock immediately. The
    /// provider Vec is append-only (register_or_replace never shrinks it), so
    /// the index stays valid after the guard drops. Holding the read guard
    /// across the network call would make switching models mid-request block on
    /// the write lock for the full request timeout, freezing the app.
    fn active_index_snapshot(&self) -> Result<usize, ProviderError> {
        let active = self
            .active_index
            .read()
            .map_err(|_| ProviderError::NotAvailable("Provider router lock poisoned".into()))?;
        active.ok_or_else(|| {
            ProviderError::NotAvailable("No active provider. Select a model first.".into())
        })
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
