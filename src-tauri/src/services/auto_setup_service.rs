/*
 * Title: auto_setup_service.rs
 * Tech Stack: Rust, reqwest
 * Description: Auto-setup service that detects and registers local LLM providers
 *   on startup. Checks common local endpoints (Ollama, LM Studio, llama.cpp).
 * Important Details: Runs non-blocking probes on localhost. If a provider is found,
 *   it's automatically registered and activated. This eliminates the manual
 *   "go to Models, fill in a form" step for users who already have Ollama running.
 */

use crate::providers::openai_compatible::OpenAiCompatibleProvider;
use crate::providers::ProviderRouter;

/// Common local LLM provider endpoints to probe on startup.
const LOCAL_PROVIDERS: &[(&str, &str, &str)] = &[
    ("Ollama", "http://127.0.0.1:11434", "llama3.2:3b"),
    ("LM Studio", "http://127.0.0.1:1234", "local-model"),
    ("llama.cpp", "http://127.0.0.1:8080", "local-model"),
];

/// Probe local endpoints and auto-register any responding provider.
/// Called once during app startup. Blocks briefly (up to ~1.5s if no providers respond).
/// Skips providers that are already registered to avoid duplicates on restart.
pub fn auto_detect_providers(router: &mut ProviderRouter) {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .connect_timeout(std::time::Duration::from_millis(500))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new());

    /* Get existing provider names to skip duplicates across restarts */
    let existing_names: Vec<String> = router
        .list_providers()
        .iter()
        .map(|p| p.name.clone())
        .collect();

    for (name, url, default_model) in LOCAL_PROVIDERS {
        /* Skip if already registered (prevents duplicates on restart) */
        if existing_names.iter().any(|n| n == name) {
            tracing::debug!("Provider {name} already registered, skipping");
            continue;
        }

        let health_url = format!("{url}/v1/models");

        match client.get(&health_url).send() {
            Ok(resp) if resp.status().is_success() => {
                tracing::info!("Auto-detected local provider: {name} at {url}");

                /* Read the actual loaded model from the /v1/models listing so
                requests name a model the server really has. Falls back to a
                sensible default when the body is empty or unparseable. */
                let body = resp.text().unwrap_or_default();
                let model = extract_model_name(&body, default_model);

                let provider = OpenAiCompatibleProvider::new(
                    name.to_string(),
                    url.to_string(),
                    None,
                    model,
                    true,
                );

                let index = router.register_or_replace(Box::new(provider));
                if router.set_active(index).is_ok() {
                    tracing::info!("Auto-activated provider: {name} (index {index})");
                    return; /* Stop after first successful provider */
                }
            }
            Ok(_) => {
                tracing::debug!("Provider {name} at {url} responded but not ready");
            }
            Err(_) => {
                tracing::debug!("No provider found at {url}");
            }
        }
    }

    tracing::info!("No local LLM providers detected. User can register manually in Models.");
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
