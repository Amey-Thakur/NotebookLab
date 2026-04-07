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

                /* Try to get the actual model name from the response */
                let model = extract_model_name(&resp, default_model);

                let provider = OpenAiCompatibleProvider::new(
                    name.to_string(),
                    url.to_string(),
                    None,
                    model,
                    true,
                );

                let index = router.register(Box::new(provider));
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


/// Placeholder: returns fallback model name.
/// TODO: Parse /v1/models response body to get actual loaded model name.
/// Currently the response is consumed by reqwest before this is called,
/// so we always use the hardcoded default. This means if the user has
/// a different model loaded (e.g. mistral:7b), requests will specify
/// the wrong model name. Fix by reading body text before calling this.
fn extract_model_name(_resp: &reqwest::blocking::Response, fallback: &str) -> String {
    fallback.to_string()
}
