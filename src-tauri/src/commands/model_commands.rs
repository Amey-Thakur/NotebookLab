/*
 * Name: model_commands.rs
 * Purpose: Tauri commands for managing LLM providers and models at runtime.
 * Description: Allows the frontend to register local (llama.cpp, Ollama) and
 *   cloud (OpenAI, Anthropic) providers dynamically. The active
 *   provider can be switched without restarting the app. Provider
 *   state lives in ProviderRouter.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
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

/// List registered providers with their availability. Async because listing
/// probes each provider's `/v1/models` endpoint over the network, which would
/// otherwise block the main thread (and freeze the UI) for a stalled provider.
#[tauri::command(rename_all = "snake_case")]
pub async fn list_providers(app: tauri::AppHandle) -> AppResult<Vec<ProviderInfo>> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state: State<'_, AppState> = app.state();
        let providers = state.provider_read()?;
        Ok(providers.list_providers())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Provider listing task failed: {e}")))?
}

/// Register (or replace) a provider. Async because it takes the provider WRITE
/// lock, which a long in-flight generation holds via its read guard; doing that
/// wait off the main thread keeps the window responsive.
#[tauri::command(rename_all = "snake_case")]
pub async fn register_provider(
    app: tauri::AppHandle,
    input: RegisterProviderInput,
) -> AppResult<usize> {
    if input.name.trim().is_empty() || input.name.len() > 200 {
        return Err(AppError::InvalidInput(
            "Provider name is required (max 200 chars)".into(),
        ));
    }
    if input.base_url.trim().is_empty() || input.base_url.len() > 2000 {
        return Err(AppError::InvalidInput(
            "Base URL is required (max 2000 chars)".into(),
        ));
    }
    if input.model.trim().is_empty() || input.model.len() > 200 {
        return Err(AppError::InvalidInput(
            "Model name is required (max 200 chars)".into(),
        ));
    }

    /* Validate URL scheme and host to prevent SSRF */
    validate_provider_url(&input.base_url, input.is_local)?;

    /* Reject sending API keys over unencrypted HTTP to remote providers */
    if input.api_key.is_some() && !input.is_local && !input.base_url.starts_with("https://") {
        return Err(AppError::InvalidInput(
            "API keys can only be sent to HTTPS endpoints for cloud providers".into(),
        ));
    }

    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state: State<'_, AppState> = app.state();
        let provider = OpenAiCompatibleProvider::new(
            input.name,
            input.base_url,
            input.api_key,
            input.model,
            input.is_local,
        );
        let mut providers = state.provider_write()?;
        let index = providers.register_or_replace(Box::new(provider));
        tracing::info!("Registered provider at index {index}");
        Ok(index)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Register task failed: {e}")))?
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_active_provider(state: State<'_, AppState>, index: usize) -> AppResult<()> {
    let providers = state.provider_read()?;
    providers
        .set_active(index)
        .map_err(|e| AppError::Provider(e.to_string()))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_active_provider_name(state: State<'_, AppState>) -> AppResult<Option<String>> {
    let providers = state.provider_read()?;
    Ok(providers.active_name())
}

/// Re-run local provider detection on demand. Powers the "Check again" action
/// in the Models page; startup runs the same probe automatically.
/// Async because the probes block for up to two seconds per endpoint.
#[tauri::command(rename_all = "snake_case")]
pub async fn detect_providers(app: tauri::AppHandle) -> AppResult<Vec<ProviderInfo>> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Manager;
        let state: State<'_, AppState> = app.state();
        {
            let mut providers = state.provider_write()?;
            crate::services::auto_setup_service::auto_detect_providers(&mut providers);
        }
        let providers = state.provider_read()?;
        Ok(providers.list_providers())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Detection task failed: {e}")))?
}

/// Validate provider URL to prevent SSRF attacks.
/// Local providers: must use loopback addresses only.
/// Cloud providers: must use https:// and not target private/internal networks.
///
/// Parses with a real URL parser rather than string slicing: naive slicing
/// mis-reads userinfo (`https://x@169.254.169.254/`) and bracketed IPv6
/// (`http://[::1]:11434`), which both defeats the guard and rejects legitimate
/// IPv6 loopback providers.
fn validate_provider_url(url: &str, is_local: bool) -> AppResult<()> {
    let parsed = url::Url::parse(url)
        .map_err(|_| AppError::InvalidInput("Provider URL is not a valid URL".into()))?;

    match parsed.scheme() {
        "http" | "https" => {}
        _ => {
            return Err(AppError::InvalidInput(
                "Provider URL must use http:// or https:// scheme".into(),
            ));
        }
    }

    /* Embedded credentials can smuggle a different real host past the checks
    below (reqwest connects to the host, not the userinfo), so reject them. */
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(AppError::InvalidInput(
            "Provider URL must not contain embedded credentials".into(),
        ));
    }

    let host = parsed
        .host()
        .ok_or_else(|| AppError::InvalidInput("Provider URL must include a host".into()))?;

    if is_local {
        let is_loopback = match host {
            url::Host::Ipv4(ip) => ip.is_loopback(),
            url::Host::Ipv6(ip) => ip.is_loopback(),
            url::Host::Domain(name) => name.eq_ignore_ascii_case("localhost"),
        };
        if !is_loopback {
            return Err(AppError::InvalidInput(
                "Local providers must use 127.0.0.1 or localhost".into(),
            ));
        }
    } else {
        let is_internal = match host {
            url::Host::Ipv4(ip) => is_internal_v4(ip),
            url::Host::Ipv6(ip) => {
                /* An IPv4-mapped address (::ffff:a.b.c.d) reaches the underlying
                IPv4 host on dual-stack systems, so apply the IPv4 rules to it;
                otherwise reject loopback, unspecified, unique-local (fc00::/7),
                and link-local (fe80::/10). is_unique_local / link-local helpers
                are unstable, so match the ranges directly. */
                if let Some(v4) = ip.to_ipv4_mapped() {
                    is_internal_v4(v4)
                } else {
                    ip.is_loopback()
                        || ip.is_unspecified()
                        || (ip.octets()[0] & 0xfe) == 0xfc
                        || (ip.segments()[0] & 0xffc0) == 0xfe80
                }
            }
            url::Host::Domain(name) => name.eq_ignore_ascii_case("localhost"),
        };
        if is_internal {
            return Err(AppError::InvalidInput(
                "Cloud providers cannot target private/internal networks".into(),
            ));
        }
    }

    Ok(())
}

/// Whether an IPv4 address points at the loopback, private, link-local, or
/// unspecified ranges that a cloud provider must never target.
fn is_internal_v4(ip: std::net::Ipv4Addr) -> bool {
    ip.is_loopback() || ip.is_private() || ip.is_link_local() || ip.is_unspecified()
}

#[cfg(test)]
mod url_validation_tests {
    use super::validate_provider_url;

    #[test]
    fn accepts_loopback_for_local() {
        assert!(validate_provider_url("http://127.0.0.1:11434", true).is_ok());
        assert!(validate_provider_url("http://localhost:1234/v1", true).is_ok());
        assert!(validate_provider_url("http://[::1]:11434", true).is_ok());
    }

    #[test]
    fn rejects_non_loopback_for_local() {
        assert!(validate_provider_url("http://169.254.169.254/v1", true).is_err());
        assert!(validate_provider_url("https://api.openai.com/v1", true).is_err());
    }

    #[test]
    fn accepts_public_https_for_cloud() {
        assert!(validate_provider_url("https://api.openai.com/v1", false).is_ok());
    }

    #[test]
    fn blocks_internal_targets_for_cloud() {
        assert!(validate_provider_url("http://169.254.169.254/latest/meta-data", false).is_err());
        assert!(validate_provider_url("http://10.0.0.5/v1", false).is_err());
        assert!(validate_provider_url("http://192.168.1.1/v1", false).is_err());
        assert!(validate_provider_url("http://localhost/v1", false).is_err());
    }

    #[test]
    fn blocks_userinfo_smuggling_for_cloud() {
        /* Naive slicing read the host as "x@169.254.169.254" and let this pass. */
        assert!(validate_provider_url("https://x@169.254.169.254/v1", false).is_err());
    }

    #[test]
    fn blocks_internal_ipv6_targets_for_cloud() {
        /* Unique-local (fc00::/7), link-local (fe80::/10), loopback, and an
        IPv4-mapped link-local metadata address must all be rejected. */
        assert!(validate_provider_url("http://[fd00::1]/v1", false).is_err());
        assert!(validate_provider_url("http://[fe80::1]/v1", false).is_err());
        assert!(validate_provider_url("http://[::1]/v1", false).is_err());
        assert!(validate_provider_url("http://[::ffff:169.254.169.254]/v1", false).is_err());
        /* A public IPv6 address is still allowed. */
        assert!(validate_provider_url("https://[2606:4700:4700::1111]/v1", false).is_ok());
    }

    #[test]
    fn rejects_non_http_scheme() {
        assert!(validate_provider_url("ftp://example.com", false).is_err());
        assert!(validate_provider_url("file:///etc/passwd", false).is_err());
    }
}
