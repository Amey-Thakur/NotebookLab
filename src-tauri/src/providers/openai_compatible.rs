/*
 * Name: openai_compatible.rs
 * Purpose: Provider for any OpenAI-compatible API.
 * Description: Covers OpenAI, llama.cpp server, Ollama, LM Studio, and any
 *   other server exposing /v1/chat/completions. The base_url is
 *   configurable per provider instance. llama.cpp sidecar uses
 *   http://127.0.0.1:{port}, while OpenAI uses
 *   https://api.openai.com. API key is optional (not needed for
 *   local servers like llama.cpp or Ollama).
 * Tech Stack: Rust, reqwest, serde
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use std::time::Duration;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use super::traits::{
    ChatRequest, ChatResponse, LlmProvider, MessageRole, ProviderError, TokenUsage,
};

pub struct OpenAiCompatibleProvider {
    name: String,
    kind: String,
    base_url: String,
    api_key: Option<String>,
    model: String,
    is_local: bool,
    client: Client,
}

impl OpenAiCompatibleProvider {
    pub fn new(
        name: String,
        base_url: String,
        api_key: Option<String>,
        model: String,
        is_local: bool,
    ) -> Self {
        Self::with_kind(name, "custom".into(), base_url, api_key, model, is_local)
    }

    /// Construct with an explicit provider family ("ollama", "openai",
    /// "deepseek", "sidecar", ...) so the UI can group and label it; the wire
    /// protocol is the same OpenAI-compatible API either way.
    pub fn with_kind(
        name: String,
        kind: String,
        base_url: String,
        api_key: Option<String>,
        model: String,
        is_local: bool,
    ) -> Self {
        Self {
            name,
            kind,
            base_url,
            api_key,
            model,
            is_local,
            /* 120s timeout prevents hanging on unresponsive providers */
            client: Client::builder()
                .timeout(Duration::from_secs(120))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }
}

impl LlmProvider for OpenAiCompatibleProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn kind(&self) -> &str {
        &self.kind
    }

    fn model(&self) -> &str {
        &self.model
    }

    fn is_local(&self) -> bool {
        self.is_local
    }

    fn is_available(&self) -> bool {
        let url = format!("{}/v1/models", self.base_url);
        /* A short per-request timeout for the reachability probe. The provider
        listing calls this while holding the router read lock, so a stalled
        remote host must not pin that lock (and delay sidecar activation and
        provider registration, which need the write lock) for the client's full
        120s. A healthy endpoint answers in milliseconds. */
        let mut req = self.client.get(&url).timeout(Duration::from_secs(4));

        if let Some(ref key) = self.api_key {
            req = req.bearer_auth(key);
        }

        req.send().map(|r| r.status().is_success()).unwrap_or(false)
    }

    fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, ProviderError> {
        let url = format!("{}/v1/chat/completions", self.base_url);

        let api_messages: Vec<ApiMessage> = request
            .messages
            .into_iter()
            .map(|m| ApiMessage {
                role: match m.role {
                    MessageRole::System => "system".into(),
                    MessageRole::User => "user".into(),
                    MessageRole::Assistant => "assistant".into(),
                },
                content: m.content,
            })
            .collect();

        let body = ApiRequest {
            model: self.model.clone(),
            messages: api_messages,
            max_tokens: request.max_tokens,
            temperature: request.temperature,
            stream: false,
        };

        let mut req = self.client.post(&url).json(&body);

        if let Some(ref key) = self.api_key {
            req = req.bearer_auth(key);
        }

        let response = req
            .send()
            .map_err(|e| ProviderError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            /* Truncate error body to avoid leaking provider internals to frontend */
            let text = response.text().unwrap_or_default();
            let truncated = crate::utils::text_utils::truncate_to_char_boundary(&text, 200);
            return Err(ProviderError::RequestFailed(format!(
                "HTTP {status}: {truncated}"
            )));
        }

        let api_response: ApiResponse = response
            .json()
            .map_err(|e| ProviderError::InvalidResponse(e.to_string()))?;

        let choice = api_response
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| ProviderError::InvalidResponse("No choices in response".into()))?;

        Ok(ChatResponse {
            content: choice.message.content,
            model: api_response.model,
            usage: api_response.usage.map(|u| TokenUsage {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: u.total_tokens,
            }),
        })
    }

    /// Generate an embedding vector via the /v1/embeddings endpoint.
    /// Supported by Ollama, llama.cpp, and OpenAI. Returns None if unavailable.
    fn embed(&self, text: &str) -> Result<Option<Vec<f32>>, ProviderError> {
        let url = format!("{}/v1/embeddings", self.base_url);

        let body = serde_json::json!({
            "model": self.model,
            "input": text,
        });

        let mut req = self.client.post(&url).json(&body);
        if let Some(ref key) = self.api_key {
            req = req.bearer_auth(key);
        }

        match req.send() {
            Ok(resp) if resp.status().is_success() => {
                let json: serde_json::Value = resp
                    .json()
                    .map_err(|e| ProviderError::InvalidResponse(e.to_string()))?;

                let embedding = json
                    .get("data")
                    .and_then(|d| d.get(0))
                    .and_then(|d| d.get("embedding"))
                    .and_then(|e| e.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_f64().map(|f| f as f32))
                            .collect::<Vec<f32>>()
                    });

                Ok(embedding)
            }
            Ok(_) => Ok(None),
            Err(_) => Ok(None),
        }
    }
}

/* OpenAI API wire format */

#[derive(Serialize)]
struct ApiRequest {
    model: String,
    messages: Vec<ApiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    stream: bool,
}

#[derive(Serialize, Deserialize)]
struct ApiMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ApiResponse {
    model: String,
    choices: Vec<ApiChoice>,
    usage: Option<ApiUsage>,
}

#[derive(Deserialize)]
struct ApiChoice {
    message: ApiMessage,
}

#[derive(Deserialize)]
struct ApiUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}
