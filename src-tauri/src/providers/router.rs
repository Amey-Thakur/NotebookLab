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

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, RwLock};

use super::auto_select;
use super::traits::{ChatRequest, ChatResponse, LlmProvider, ProviderError, TokenUsage};

pub struct ProviderRouter {
    providers: Vec<Box<dyn LlmProvider>>,
    active_index: RwLock<Option<usize>>,
    /// When set, chat completions pick the best provider for each request's
    /// purpose (with fallback on failure) instead of using the active one.
    auto_enabled: AtomicBool,
    /// Session token accounting, recorded from what providers actually
    /// report, so the UI shows real numbers rather than estimates.
    usage: Mutex<UsageLog>,
}

#[derive(Default)]
struct UsageLog {
    last: Option<LastRequest>,
    models: Vec<ModelUsage>,
}

#[derive(Clone, serde::Serialize)]
pub struct LastRequest {
    pub provider: String,
    pub kind: String,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    /// The model's known context window, when it is a known fact; None keeps
    /// the display honest for user-configured local servers.
    pub context_window: Option<u32>,
    pub at_epoch_ms: u64,
    /// Whether automatic selection chose this provider.
    pub auto_selected: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct ModelUsage {
    pub provider: String,
    pub kind: String,
    pub model: String,
    pub requests: u32,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
}

/// Everything the token/usage UI shows, read from memory in microseconds.
#[derive(serde::Serialize)]
pub struct UsageStats {
    pub auto_enabled: bool,
    pub last: Option<LastRequest>,
    pub models: Vec<ModelUsage>,
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
            auto_enabled: AtomicBool::new(false),
            usage: Mutex::new(UsageLog::default()),
        }
    }

    /// Turn automatic per-task model selection on or off. Interior mutability,
    /// so flipping it needs only the read guard.
    pub fn set_auto(&self, enabled: bool) {
        self.auto_enabled.store(enabled, Ordering::Release);
    }

    pub fn auto_enabled(&self) -> bool {
        self.auto_enabled.load(Ordering::Acquire)
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

    /// Remove a provider by name. Returns true when something was removed.
    /// The active index is repaired: cleared if it pointed at the removed
    /// provider, shifted down if it pointed past it. Requires &mut self (the
    /// write lock), so no reader holds a guard while indexes move; a stale
    /// index snapshot taken before removal is handled by the .get() lookups
    /// below, which fail with a clear error instead of panicking.
    pub fn remove_by_name(&mut self, name: &str) -> bool {
        let Some(removed) = self.providers.iter().position(|p| p.name() == name) else {
            return false;
        };
        self.providers.remove(removed);
        if let Ok(mut active) = self.active_index.write() {
            *active = match *active {
                Some(idx) if idx == removed => None,
                Some(idx) if idx > removed => Some(idx - 1),
                other => other,
            };
        }
        true
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

    /// Identify the model that will answer the next request: a stable key and
    /// whether it runs locally.
    ///
    /// The job runner uses this to remember how long generation takes per model,
    /// so a progress estimate reflects the machine it is on rather than a
    /// constant. Falls back to a generic key when nothing is active, which keeps
    /// the estimate usable instead of making the caller handle an `Option` it
    /// cannot act on.
    pub fn active_profile(&self) -> (String, bool) {
        let active = self.active_index.read().ok().and_then(|a| *a);
        match active.and_then(|idx| self.providers.get(idx)) {
            Some(p) => (format!("{}::{}", p.kind(), p.model()), p.is_local()),
            None => ("unknown".to_string(), true),
        }
    }

    /// Get the name of the currently active provider.
    pub fn active_name(&self) -> Option<String> {
        let active = self.active_index.read().ok()?;
        let idx = (*active)?;
        Some(self.providers.get(idx)?.name().to_string())
    }

    /// Send a chat completion request. With auto selection off this uses the
    /// active provider; with it on, providers are tried in per-purpose score
    /// order with fallback, so one dead endpoint never fails a request
    /// another could serve. Every successful reply's reported token usage is
    /// recorded for the live usage display.
    pub fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, ProviderError> {
        if !self.auto_enabled() {
            let idx = self.active_index_snapshot()?;

            /* Availability check removed from hot path. The completion call
            itself will return a clear error if the provider is unreachable.
            Checking availability added ~100-300ms latency per request. */
            let provider = self.provider_at(idx)?;
            let identity = identity_of(provider);
            let response = provider.chat_completion(request)?;
            self.record_usage(identity, response.usage.clone(), false);
            return Ok(response);
        }

        /* Auto: rank every provider for this request's purpose, then walk the
        list. Trying at most three keeps a fully-offline failure fast. A
        candidate whose KNOWN context window cannot hold this request (plus
        the reply) is deprioritized rather than sent a prompt it would
        truncate; unknown windows are given the benefit of the doubt. */
        let needed_tokens: u32 = request
            .messages
            .iter()
            .map(|m| (m.content.len() as u32) / 4 + 1)
            .sum::<u32>()
            + request.max_tokens.unwrap_or(2048)
            + 256;

        let mut order: Vec<(bool, i32, usize)> = self
            .providers
            .iter()
            .enumerate()
            .map(|(i, p)| {
                let fits = auto_select::context_window(p.kind(), p.model())
                    .map(|window| window >= needed_tokens)
                    .unwrap_or(true);
                (
                    fits,
                    auto_select::score(p.kind(), p.model(), p.is_local(), request.purpose),
                    i,
                )
            })
            .collect();
        /* Fitting candidates first, best score within each group; a too-small
        window stays reachable as a last resort rather than failing outright. */
        order.sort_by_key(|entry| (std::cmp::Reverse(entry.0), std::cmp::Reverse(entry.1)));

        let mut last_error =
            ProviderError::NotAvailable("No providers registered. Set up a model first.".into());
        for (_, _, idx) in order.into_iter().take(3) {
            let Ok(provider) = self.provider_at(idx) else {
                continue;
            };
            let identity = identity_of(provider);
            match provider.chat_completion(request.clone()) {
                Ok(response) => {
                    self.record_usage(identity, response.usage.clone(), true);
                    return Ok(response);
                }
                Err(e) => {
                    tracing::warn!("Auto selection: {} failed, trying next: {e}", identity.0);
                    last_error = e;
                }
            }
        }
        Err(last_error)
    }

    /// Fold one reply's reported usage into the session log.
    fn record_usage(
        &self,
        (name, kind, model): (String, String, String),
        usage: Option<TokenUsage>,
        auto_selected: bool,
    ) {
        let Ok(mut log) = self.usage.lock() else {
            return;
        };
        let (prompt, completion) = usage
            .map(|u| (u.prompt_tokens, u.completion_tokens))
            .unwrap_or((0, 0));

        log.last = Some(LastRequest {
            provider: name.clone(),
            kind: kind.clone(),
            model: model.clone(),
            prompt_tokens: prompt,
            completion_tokens: completion,
            context_window: auto_select::context_window(&kind, &model),
            at_epoch_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            auto_selected,
        });

        if let Some(entry) = log
            .models
            .iter_mut()
            .find(|m| m.provider == name && m.model == model)
        {
            entry.requests += 1;
            entry.prompt_tokens += u64::from(prompt);
            entry.completion_tokens += u64::from(completion);
        } else {
            log.models.push(ModelUsage {
                provider: name,
                kind,
                model,
                requests: 1,
                prompt_tokens: u64::from(prompt),
                completion_tokens: u64::from(completion),
            });
        }
    }

    /// Session usage for the live token display.
    pub fn usage_stats(&self) -> UsageStats {
        let log = self.usage.lock();
        match log {
            Ok(log) => UsageStats {
                auto_enabled: self.auto_enabled(),
                last: log.last.clone(),
                models: log.models.clone(),
            },
            Err(_) => UsageStats {
                auto_enabled: self.auto_enabled(),
                last: None,
                models: Vec::new(),
            },
        }
    }

    /// The context window of the provider a chat request would use right now:
    /// the top-ranked Balanced candidate under auto selection, else the
    /// active provider. Unknown windows fall back to a conservative floor so
    /// context budgeting never overfills a small window.
    pub fn planned_context_window(&self) -> u32 {
        const CONSERVATIVE_FLOOR: u32 = 4096;

        let planned = if self.auto_enabled() {
            self.providers
                .iter()
                .max_by_key(|p| {
                    auto_select::score(
                        p.kind(),
                        p.model(),
                        p.is_local(),
                        super::traits::TaskPurpose::Balanced,
                    )
                })
                .map(|p| (p.kind().to_string(), p.model().to_string()))
        } else {
            self.active_index_snapshot()
                .ok()
                .and_then(|idx| self.providers.get(idx))
                .map(|p| (p.kind().to_string(), p.model().to_string()))
        };

        planned
            .and_then(|(kind, model)| auto_select::context_window(&kind, &model))
            .unwrap_or(CONSERVATIVE_FLOOR)
    }

    /// Generate an embedding vector using the active provider. Embeddings
    /// stay pinned to the active provider even under auto selection: mixing
    /// embedding spaces across models would corrupt semantic search.
    pub fn embed(&self, text: &str) -> Result<Option<Vec<f32>>, ProviderError> {
        let idx = self.active_index_snapshot()?;
        self.provider_at(idx)?.embed(text)
    }

    /// Bounds-checked provider lookup. A snapshot index can go stale if a
    /// provider is removed between the snapshot and this call; failing with a
    /// clear error beats panicking mid-request.
    fn provider_at(&self, idx: usize) -> Result<&dyn LlmProvider, ProviderError> {
        self.providers.get(idx).map(|p| p.as_ref()).ok_or_else(|| {
            ProviderError::NotAvailable("Provider was removed. Pick a model.".into())
        })
    }

    /// Read the active provider index and release the lock immediately.
    /// Holding the read guard across the network call would make switching
    /// models mid-request block on the write lock for the full request
    /// timeout, freezing the app. Removal can invalidate the snapshot, which
    /// provider_at converts into a clear error rather than a panic.
    fn active_index_snapshot(&self) -> Result<usize, ProviderError> {
        let active = self
            .active_index
            .read()
            .map_err(|_| ProviderError::NotAvailable("Provider router lock poisoned".into()))?;
        active.ok_or_else(|| {
            /* The app is now watching for a local server rather than probing
            once at startup, so this says what it is doing instead of implying
            the user must go and configure something. */
            ProviderError::NotAvailable(
                "No model is connected yet. Start Ollama or a local server and \
                 NotebookLab will pick it up within a few seconds, or add a \
                 provider in Models."
                    .into(),
            )
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
                kind: p.kind().to_string(),
                model: p.model().to_string(),
                is_local: p.is_local(),
                is_available: p.is_available(),
                is_active: active_idx == Some(i),
            })
            .collect()
    }
}

/// Capture a provider's identity as owned strings before a long call, so the
/// usage record never borrows across the network request.
fn identity_of(provider: &dyn LlmProvider) -> (String, String, String) {
    (
        provider.name().to_string(),
        provider.kind().to_string(),
        provider.model().to_string(),
    )
}

#[derive(Debug, serde::Serialize)]
pub struct ProviderInfo {
    pub index: usize,
    pub name: String,
    pub kind: String,
    pub model: String,
    pub is_local: bool,
    pub is_available: bool,
    pub is_active: bool,
}

#[cfg(test)]
mod router_tests {
    use super::*;

    struct FakeProvider(String);
    impl LlmProvider for FakeProvider {
        fn name(&self) -> &str {
            &self.0
        }
        fn is_local(&self) -> bool {
            true
        }
        fn is_available(&self) -> bool {
            true
        }
        fn chat_completion(&self, _request: ChatRequest) -> Result<ChatResponse, ProviderError> {
            Err(ProviderError::NotAvailable("fake".into()))
        }
    }

    fn router_with(names: &[&str]) -> ProviderRouter {
        let mut router = ProviderRouter::new();
        for n in names {
            router.register(Box::new(FakeProvider(n.to_string())));
        }
        router
    }

    #[test]
    fn remove_clears_active_when_it_pointed_at_removed() {
        let mut router = router_with(&["a", "b"]);
        router.set_active(1).unwrap();
        assert!(router.remove_by_name("b"));
        assert_eq!(router.active_name(), None);
    }

    #[test]
    fn remove_shifts_active_when_it_pointed_past_removed() {
        let mut router = router_with(&["a", "b", "c"]);
        router.set_active(2).unwrap();
        assert!(router.remove_by_name("a"));
        assert_eq!(router.active_name(), Some("c".to_string()));
    }

    #[test]
    fn remove_keeps_active_when_it_pointed_before_removed() {
        let mut router = router_with(&["a", "b"]);
        router.set_active(0).unwrap();
        assert!(router.remove_by_name("b"));
        assert_eq!(router.active_name(), Some("a".to_string()));
    }

    #[test]
    fn remove_unknown_name_is_a_noop() {
        let mut router = router_with(&["a"]);
        assert!(!router.remove_by_name("missing"));
        assert_eq!(router.list_providers().len(), 1);
    }
}
