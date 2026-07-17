/*
 * Name: provider_config_service.rs
 * Purpose: Build live providers from saved configurations and restore them at
 *   startup.
 * Description: The single mapping from a provider kind to its implementation:
 *   "anthropic" and "gemini" get their dedicated wire-format providers, and
 *   every other kind (openai, deepseek, ollama, lmstudio, llamacpp, custom)
 *   speaks the OpenAI-compatible API. Restore runs before local auto-detection
 *   so saved providers keep stable router indexes, and the persisted active
 *   choice is re-applied so the user's model survives a restart. New backend =
 *   implement LlmProvider, add a kind arm here, and the UI picks it up.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

use rusqlite::Connection;

use crate::database::repository::provider_repository::{self, ProviderConfig};
use crate::providers::anthropic::AnthropicProvider;
use crate::providers::gemini::GeminiProvider;
use crate::providers::openai_compatible::OpenAiCompatibleProvider;
use crate::providers::{LlmProvider, ProviderRouter};

/// Settings key holding the name of the provider the user last activated.
pub const ACTIVE_PROVIDER_KEY: &str = "active_provider_name";

/// Settings key for the automatic per-task model selection flag.
pub const AUTO_MODEL_KEY: &str = "auto_model_enabled";

/// Provider kinds the register command accepts. "sidecar" is absent on
/// purpose: the bundled server registers itself at runtime and is never
/// persisted (its port and key are per-session).
pub const REGISTERABLE_KINDS: &[&str] = &[
    "ollama",
    "lmstudio",
    "llamacpp",
    "openai",
    "anthropic",
    "gemini",
    "deepseek",
    "custom",
];

/// Kinds that talk to a paid/keyed cloud API and therefore require an API key
/// and an https endpoint.
pub const CLOUD_KINDS: &[&str] = &["openai", "anthropic", "gemini", "deepseek"];

/// Construct the right provider implementation for a saved configuration.
pub fn build_provider(config: &ProviderConfig) -> Box<dyn LlmProvider> {
    match config.kind.as_str() {
        "anthropic" => Box::new(AnthropicProvider::new(
            config.name.clone(),
            config.base_url.clone(),
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
        )),
        "gemini" => Box::new(GeminiProvider::new(
            config.name.clone(),
            config.base_url.clone(),
            config.api_key.clone().unwrap_or_default(),
            config.model.clone(),
        )),
        _ => Box::new(OpenAiCompatibleProvider::with_kind(
            config.name.clone(),
            config.kind.clone(),
            config.base_url.clone(),
            config.api_key.clone(),
            config.model.clone(),
            config.is_local,
        )),
    }
}

/// Read every saved provider and the persisted active choice. Split from
/// apply_saved_configs so the caller can finish with the database lock before
/// taking the provider write lock; holding both at once risks a lock-order
/// deadlock against request paths that hold the database while calling into
/// the router.
pub fn load_saved_configs(conn: &Connection) -> SavedProviderState {
    let configs = match provider_repository::list(conn) {
        Ok(configs) => configs,
        Err(e) => {
            tracing::warn!("Could not load saved providers: {e}");
            return SavedProviderState::default();
        }
    };
    let saved_active = provider_repository::get_setting(conn, ACTIVE_PROVIDER_KEY)
        .ok()
        .flatten();
    let auto_enabled = provider_repository::get_setting(conn, AUTO_MODEL_KEY)
        .ok()
        .flatten()
        .as_deref()
        == Some("true");
    SavedProviderState {
        configs,
        saved_active,
        auto_enabled,
    }
}

/// Everything restore needs from the database, read in one lock scope.
#[derive(Default)]
pub struct SavedProviderState {
    pub configs: Vec<ProviderConfig>,
    pub saved_active: Option<String>,
    pub auto_enabled: bool,
}

/// Register saved providers and re-apply the persisted active choice and the
/// auto-selection flag. Called once at startup, before local auto-detection,
/// so restored cloud connections and model choices are ready without any user
/// action.
pub fn apply_saved_configs(router: &mut ProviderRouter, saved: SavedProviderState) {
    router.set_auto(saved.auto_enabled);
    if saved.configs.is_empty() {
        return;
    }
    let count = saved.configs.len();
    for config in saved.configs {
        let name = config.name.clone();
        let index = router.register_or_replace(build_provider(&config));
        if saved.saved_active.as_deref() == Some(name.as_str()) && router.set_active(index).is_ok()
        {
            tracing::info!("Restored active provider: {name}");
        }
    }
    tracing::info!("Restored {count} saved provider(s)");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(kind: &str) -> ProviderConfig {
        ProviderConfig {
            name: format!("{kind} test"),
            kind: kind.into(),
            base_url: "https://example.com".into(),
            api_key: Some("key".into()),
            model: "m".into(),
            is_local: false,
        }
    }

    #[test]
    fn kinds_map_to_matching_providers() {
        assert_eq!(build_provider(&config("anthropic")).kind(), "anthropic");
        assert_eq!(build_provider(&config("gemini")).kind(), "gemini");
        assert_eq!(build_provider(&config("openai")).kind(), "openai");
        assert_eq!(build_provider(&config("ollama")).kind(), "ollama");
    }

    #[test]
    fn cloud_kinds_are_a_subset_of_registerable() {
        for kind in CLOUD_KINDS {
            assert!(REGISTERABLE_KINDS.contains(kind));
        }
    }
}
