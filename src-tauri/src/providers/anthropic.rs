/*
 * Name: anthropic.rs
 * Purpose: Provider for the Anthropic (Claude) Messages API.
 * Description: Anthropic does not speak the OpenAI wire format: requests go to
 *   /v1/messages with an x-api-key header and an anthropic-version header,
 *   system prompts are a top-level field rather than a message role, and
 *   max_tokens is required. Responses carry content as a list of typed blocks.
 *   This provider translates the app's ChatRequest into that shape and back.
 *   Embeddings are not offered by the API, so embed() stays None and search
 *   falls back to keyword ranking. Response parsing lives in pure helper
 *   functions so it is unit-testable without a network.
 * Tech Stack: Rust, reqwest, serde
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

use std::time::Duration;

use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

use super::traits::{
    ChatRequest, ChatResponse, LlmProvider, MessageRole, ProviderError, TokenUsage,
};

const ANTHROPIC_VERSION: &str = "2023-06-01";
/* The Messages API requires max_tokens; use a generous default when the app
does not specify one, matching what the OpenAI-compatible path leaves open. */
const DEFAULT_MAX_TOKENS: u32 = 2048;

pub struct AnthropicProvider {
    name: String,
    base_url: String,
    api_key: String,
    model: String,
    client: Client,
}

impl AnthropicProvider {
    pub fn new(name: String, base_url: String, api_key: String, model: String) -> Self {
        Self {
            name,
            base_url,
            api_key,
            model,
            client: Client::builder()
                .timeout(Duration::from_secs(120))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }
}

impl LlmProvider for AnthropicProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn kind(&self) -> &str {
        "anthropic"
    }

    fn model(&self) -> &str {
        &self.model
    }

    fn is_local(&self) -> bool {
        false
    }

    fn is_available(&self) -> bool {
        /* Short probe so a stalled endpoint cannot pin the router read lock. */
        let url = format!("{}/v1/models", self.base_url);
        self.client
            .get(&url)
            .timeout(Duration::from_secs(4))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .send()
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, ProviderError> {
        let url = format!("{}/v1/messages", self.base_url);
        let body = build_request_body(&self.model, request);

        let response = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&body)
            .send()
            .map_err(|e| ProviderError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            /* Truncate error body to avoid leaking provider internals */
            let text = response.text().unwrap_or_default();
            let truncated = crate::utils::text_utils::truncate_to_char_boundary(&text, 200);
            return Err(ProviderError::RequestFailed(format!(
                "HTTP {status}: {truncated}"
            )));
        }

        let api_response: MessagesResponse = response
            .json()
            .map_err(|e| ProviderError::InvalidResponse(e.to_string()))?;

        parse_response(api_response)
    }
}

/// Fold the app's message list into the Messages API shape: system messages
/// join into the top-level `system` field, the rest keep their order.
fn build_request_body(model: &str, request: ChatRequest) -> MessagesRequest {
    let mut system_parts: Vec<String> = Vec::new();
    let mut messages: Vec<WireMessage> = Vec::new();

    for message in request.messages {
        match message.role {
            MessageRole::System => system_parts.push(message.content),
            MessageRole::User => messages.push(WireMessage {
                role: "user",
                content: message.content,
            }),
            MessageRole::Assistant => messages.push(WireMessage {
                role: "assistant",
                content: message.content,
            }),
        }
    }

    MessagesRequest {
        model: model.to_string(),
        max_tokens: request.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS),
        system: if system_parts.is_empty() {
            None
        } else {
            Some(system_parts.join("\n\n"))
        },
        messages,
        temperature: request.temperature,
    }
}

/// Join the text blocks of a Messages response into the app's ChatResponse.
fn parse_response(response: MessagesResponse) -> Result<ChatResponse, ProviderError> {
    let content: String = response
        .content
        .iter()
        .filter(|block| block.block_type == "text")
        .filter_map(|block| block.text.as_deref())
        .collect::<Vec<_>>()
        .join("");

    if content.is_empty() {
        return Err(ProviderError::InvalidResponse(
            "No text content in response".into(),
        ));
    }

    Ok(ChatResponse {
        content,
        model: response.model,
        usage: response.usage.map(|u| TokenUsage {
            prompt_tokens: u.input_tokens,
            completion_tokens: u.output_tokens,
            total_tokens: u.input_tokens + u.output_tokens,
        }),
    })
}

/* Messages API wire format */

#[derive(Serialize)]
struct MessagesRequest {
    model: String,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<String>,
    messages: Vec<WireMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize)]
struct WireMessage {
    role: &'static str,
    content: String,
}

#[derive(Deserialize)]
struct MessagesResponse {
    model: String,
    content: Vec<ContentBlock>,
    usage: Option<WireUsage>,
}

#[derive(Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct WireUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::traits::ChatMessage;

    fn request_with(messages: Vec<ChatMessage>) -> ChatRequest {
        ChatRequest {
            messages,
            max_tokens: None,
            temperature: None,
        }
    }

    #[test]
    fn system_messages_move_to_top_level_field() {
        let body = build_request_body(
            "claude-sonnet-5",
            request_with(vec![
                ChatMessage {
                    role: MessageRole::System,
                    content: "Be brief.".into(),
                },
                ChatMessage {
                    role: MessageRole::User,
                    content: "Hi".into(),
                },
            ]),
        );
        assert_eq!(body.system.as_deref(), Some("Be brief."));
        assert_eq!(body.messages.len(), 1);
        assert_eq!(body.messages[0].role, "user");
        assert_eq!(body.max_tokens, DEFAULT_MAX_TOKENS);
    }

    #[test]
    fn parses_text_blocks_and_usage() {
        let response: MessagesResponse = serde_json::from_str(
            r#"{
                "model": "claude-sonnet-5",
                "content": [
                    {"type": "text", "text": "Hello "},
                    {"type": "text", "text": "world"}
                ],
                "usage": {"input_tokens": 10, "output_tokens": 5}
            }"#,
        )
        .unwrap();
        let parsed = parse_response(response).unwrap();
        assert_eq!(parsed.content, "Hello world");
        assert_eq!(parsed.usage.unwrap().total_tokens, 15);
    }

    #[test]
    fn rejects_response_without_text() {
        let response: MessagesResponse = serde_json::from_str(
            r#"{"model": "m", "content": [{"type": "tool_use"}], "usage": null}"#,
        )
        .unwrap();
        assert!(parse_response(response).is_err());
    }
}
