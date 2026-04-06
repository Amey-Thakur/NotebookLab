/*
 * Title: openai_compatible.rs
 * Tech Stack: Rust, reqwest, serde
 * Description: Provider for any OpenAI-compatible API. Covers OpenAI, llama.cpp server,
 *   Ollama, LM Studio, and any other server exposing /v1/chat/completions.
 * Important Details: The base_url is configurable per provider instance. llama.cpp
 *   sidecar uses http://127.0.0.1:{port}, while OpenAI uses https://api.openai.com.
 *   API key is optional (not needed for local servers like llama.cpp or Ollama).
 */

use std::time::Duration;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use super::traits::{
    ChatMessage, ChatRequest, ChatResponse, LlmProvider, MessageRole, ProviderError, TokenUsage,
};


pub struct OpenAiCompatibleProvider {
    name: String,
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
        Self {
            name,
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

    /// Create a provider configured for a local llama.cpp sidecar.
    #[allow(dead_code)]
    pub fn llama_cpp(port: u16, model_name: String) -> Self {
        Self::new(
            "llama.cpp".into(),
            format!("http://127.0.0.1:{port}"),
            None,
            model_name,
            true,
        )
    }

    /// Create a provider configured for Ollama's local server.
    #[allow(dead_code)]
    pub fn ollama(model_name: String) -> Self {
        Self::new(
            "Ollama".into(),
            "http://127.0.0.1:11434".into(),
            None,
            model_name,
            true,
        )
    }

    /// Create a provider configured for the OpenAI API.
    #[allow(dead_code)]
    pub fn openai(api_key: String, model: String) -> Self {
        Self::new(
            "OpenAI".into(),
            "https://api.openai.com".into(),
            Some(api_key),
            model,
            false,
        )
    }
}


impl LlmProvider for OpenAiCompatibleProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn is_local(&self) -> bool {
        self.is_local
    }

    fn is_available(&self) -> bool {
        let url = format!("{}/v1/models", self.base_url);
        let mut req = self.client.get(&url);

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
            /* Use char boundary check to avoid panic on multi-byte UTF-8 */
            let truncated = text.get(..200).unwrap_or(&text);
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
