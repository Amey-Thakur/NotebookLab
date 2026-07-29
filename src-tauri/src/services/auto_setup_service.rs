/*
 * Name: auto_setup_service.rs
 * Purpose: Auto-setup service that detects and registers local LLM providers
 *   on startup.
 * Description: Checks common local endpoints (Ollama, LM Studio, llama.cpp).
 *   Runs non-blocking probes on localhost. If a provider is found,
 *   it's automatically registered and activated. This eliminates
 *   the manual "go to Models, fill in a form" step for users who
 *   already have Ollama running.
 * Tech Stack: Rust, reqwest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use crate::providers::openai_compatible::OpenAiCompatibleProvider;
use crate::providers::ProviderRouter;

/// Common local LLM provider endpoints to probe on startup: display name,
/// provider kind, endpoint, and a fallback model name.
const LOCAL_PROVIDERS: &[(&str, &str, &str, &str)] = &[
    ("Ollama", "ollama", "http://127.0.0.1:11434", "llama3.2:3b"),
    (
        "LM Studio",
        "lmstudio",
        "http://127.0.0.1:1234",
        "local-model",
    ),
    (
        "llama.cpp",
        "llamacpp",
        "http://127.0.0.1:8080",
        "local-model",
    ),
];

/// A local provider that answered a startup probe, ready to register.
pub struct DetectedProvider {
    pub name: String,
    pub kind: String,
    pub url: String,
    pub model: String,
}

/// Probe local endpoints over the network and return the ones that responded.
///
/// This does NOT touch the router, so **no provider lock is held while these
/// HTTP calls run**. That matters: holding the write lock across a slow or
/// stalled probe (a filtered port can take many seconds to fail on Windows)
/// would block every chat and feature that needs a read lock, which looks to
/// the user like the whole app has frozen with no output and no error. Probe
/// first without the lock, then register the results in a fast, lock-held
/// step (see `register_detected`).
///
/// `existing_names` are already-registered providers, skipped to avoid
/// duplicates across restarts.
pub fn probe_local_providers(existing_names: &[String]) -> Vec<DetectedProvider> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .connect_timeout(std::time::Duration::from_millis(500))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new());

    let mut found = Vec::new();
    for (name, kind, url, default_model) in LOCAL_PROVIDERS {
        if existing_names.iter().any(|n| n == name) {
            tracing::debug!("Provider {name} already registered, skipping");
            continue;
        }

        let health_url = format!("{url}/v1/models");
        match client.get(&health_url).send() {
            Ok(resp) if resp.status().is_success() => {
                tracing::info!("Auto-detected local provider: {name} at {url}");
                /* Read the actually loaded model so requests name one the
                server really has; fall back when the body is unparseable. */
                let body = resp.text().unwrap_or_default();
                let model = extract_model_name(&body, default_model);
                found.push(DetectedProvider {
                    name: name.to_string(),
                    kind: kind.to_string(),
                    url: url.to_string(),
                    model,
                });
            }
            Ok(_) => tracing::debug!("Provider {name} at {url} responded but not ready"),
            Err(_) => tracing::debug!("No provider found at {url}"),
        }
    }
    tracing::info!("Local provider detection finished");
    found
}

/// Register probed providers into the router. Fast and network-free, so the
/// caller can hold the write lock for only the moment this runs. Activates the
/// first one when nothing is already active, so a user's saved active model is
/// never overridden by whatever local server happened to answer.
pub fn register_detected(router: &mut ProviderRouter, detected: Vec<DetectedProvider>) {
    for d in detected {
        let provider =
            OpenAiCompatibleProvider::with_kind(d.name.clone(), d.kind, d.url, None, d.model, true);
        let index = router.register_or_replace(Box::new(provider));
        /* Activate the first one found, then keep registering the rest.
        This used to return, which ended the whole function rather than the
        iteration, so a machine running both Ollama and LM Studio showed only
        one of them on the Models page. It only ever bit on a fresh install,
        because once something is active the condition is false and every
        provider registers, which is why a manual re-scan appeared to fix it. */
        if router.active_name().is_none() && router.set_active(index).is_ok() {
            tracing::info!("Auto-activated provider: {} (index {index})", d.name);
        }
    }
}

/// Read the router's current provider names for the skip-duplicates check.
pub fn provider_names(router: &ProviderRouter) -> Vec<String> {
    router
        .list_providers()
        .iter()
        .map(|p| p.name.clone())
        .collect()
}

/// Pull the first model id out of an OpenAI-style /v1/models response body.
/// The endpoint returns { "data": [ { "id": "..." }, ... ] } across Ollama,
/// LM Studio, and llama.cpp. Falls back when the shape does not match.
fn extract_model_name(body: &str, fallback: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|json| {
            json.get("data")?
                .get(0)?
                .get("id")?
                .as_str()
                .map(str::to_string)
        })
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_first_model_id() {
        let body = r#"{"object":"list","data":[{"id":"mistral:7b"},{"id":"llama3.2:3b"}]}"#;
        assert_eq!(extract_model_name(body, "fallback"), "mistral:7b");
    }

    #[test]
    fn falls_back_on_empty_list() {
        assert_eq!(extract_model_name(r#"{"data":[]}"#, "fallback"), "fallback");
    }

    #[test]
    fn falls_back_on_invalid_json() {
        assert_eq!(extract_model_name("not json", "fallback"), "fallback");
    }
}

/// How often to look for a local server while none is active.
///
/// The user in this state is waiting to start work, so the app should notice
/// their server within a few seconds of them starting it rather than making
/// them find the rescan button.
const EAGER_INTERVAL: std::time::Duration = std::time::Duration::from_secs(5);

/// How often to look once something is already answering. Slower, because
/// nothing is blocked; this only keeps the Models list honest when another
/// server appears later.
const IDLE_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

/// Watch for local model servers for as long as the app runs.
///
/// Detection used to happen exactly once, during startup. Anyone who started
/// Ollama or a llama.cpp server *after* opening NotebookLab was told there was
/// no model, and the only way out was to know that Models has a rescan button.
/// Starting a server is the most likely thing a user does right before trying
/// to generate something, so that was precisely the wrong moment to stop
/// looking.
///
/// Registration is safe to repeat: `register_or_replace` updates in place, and
/// activation only happens when nothing is active, so a user's chosen model is
/// never taken over by whatever answered a probe.
pub fn watch_local_providers(app: tauri::AppHandle) {
    use tauri::{Emitter, Manager};

    std::thread::spawn(move || loop {
        let state: tauri::State<'_, crate::state::AppState> = app.state();

        let (existing, had_active) = match state.provider_read() {
            Ok(providers) => (
                provider_names(&providers),
                providers.active_name().is_some(),
            ),
            Err(_) => (Vec::new(), false),
        };

        let detected = probe_local_providers(&existing);
        if !detected.is_empty() {
            if let Ok(mut providers) = state.provider_write() {
                register_detected(&mut providers, detected);
            }
        }

        /* Tell the frontend only when this changed something it is showing, so
        a window sitting idle is not woken every five seconds. */
        let now_active = state
            .provider_read()
            .ok()
            .and_then(|p| p.active_name())
            .is_some();
        if now_active && !had_active {
            tracing::info!("A local model became available");
            app.emit("providers-changed", ()).ok();
        }

        std::thread::sleep(if now_active {
            IDLE_INTERVAL
        } else {
            EAGER_INTERVAL
        });
    });
}
