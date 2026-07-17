/*
 * Name: gemini.rs
 * Purpose: Provider for the Google Gemini API.
 * Description: Gemini's generateContent endpoint differs from the OpenAI wire
 *   format: the model name lives in the URL path, roles are "user" and
 *   "model", consecutive same-role turns must be merged, the system prompt is
 *   a separate systemInstruction field, and the API key travels in an
 *   x-goog-api-key header. This provider translates the app's ChatRequest into
 *   that shape and back. Embeddings use a different model family, so embed()
 *   stays None and search falls back to keyword ranking. Request building and
 *   response parsing live in pure helper functions so they are unit-testable
 *   without a network.
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

pub struct GeminiProvider {
    name: String,
    base_url: String,
    api_key: String,
    model: String,
    client: Client,
}

impl GeminiProvider {
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

impl LlmProvider for GeminiProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn kind(&self) -> &str {
        "gemini"
    }

    fn model(&self) -> &str {
        &self.model
    }

    fn is_local(&self) -> bool {
        false
    }

    fn is_available(&self) -> bool {
        /* Short probe so a stalled endpoint cannot pin the router read lock. */
        let url = format!("{}/v1beta/models", self.base_url);
        self.client
            .get(&url)
            .timeout(Duration::from_secs(4))
            .header("x-goog-api-key", &self.api_key)
            .send()
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, ProviderError> {
        let url = format!(
            "{}/v1beta/models/{}:generateContent",
            self.base_url, self.model
        );
        let body = build_request_body(request);

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
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

        let api_response: GenerateResponse = response
            .json()
            .map_err(|e| ProviderError::InvalidResponse(e.to_string()))?;

        parse_response(api_response, &self.model)
    }
}

/// Fold the app's message list into the generateContent shape: system messages
/// become systemInstruction, and consecutive same-role turns merge because the
/// API requires strict user/model alternation.
fn build_request_body(request: ChatRequest) -> GenerateRequest {
    let mut system_parts: Vec<String> = Vec::new();
    let mut contents: Vec<Content> = Vec::new();

    for message in request.messages {
        let role = match message.role {
            MessageRole::System => {
                system_parts.push(message.content);
                continue;
            }
            MessageRole::User => "user",
            MessageRole::Assistant => "model",
        };

        match contents.last_mut() {
            Some(last) if last.role == role => {
                last.parts.push(Part {
                    text: message.content,
                });
            }
            _ => contents.push(Content {
                role,
                parts: vec![Part {
                    text: message.content,
                }],
            }),
        }
    }

    GenerateRequest {
        contents,
        system_instruction: if system_parts.is_empty() {
            None
        } else {
            Some(SystemInstruction {
                parts: vec![Part {
                    text: system_parts.join("\n\n"),
                }],
            })
        },
        generation_config: GenerationConfig {
            max_output_tokens: request.max_tokens,
            temperature: request.temperature,
        },
    }
}

/// Join the first candidate's text parts into the app's ChatResponse.
fn parse_response(response: GenerateResponse, model: &str) -> Result<ChatResponse, ProviderError> {
    let candidate = response
        .candidates
        .into_iter()
        .next()
        .ok_or_else(|| ProviderError::InvalidResponse("No candidates in response".into()))?;

    let content: String = candidate
        .content
        .map(|c| {
            c.parts
                .into_iter()
                .filter_map(|p| p.text)
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();

    if content.is_empty() {
        return Err(ProviderError::InvalidResponse(
            "No text content in response".into(),
        ));
    }

    Ok(ChatResponse {
        content,
        model: model.to_string(),
        usage: response.usage_metadata.map(|u| TokenUsage {
            prompt_tokens: u.prompt_token_count.unwrap_or(0),
            completion_tokens: u.candidates_token_count.unwrap_or(0),
            total_tokens: u.total_token_count.unwrap_or(0),
        }),
    })
}

/* generateContent wire format */

#[derive(Serialize)]
struct GenerateRequest {
    contents: Vec<Content>,
    #[serde(rename = "systemInstruction", skip_serializing_if = "Option::is_none")]
    system_instruction: Option<SystemInstruction>,
    #[serde(rename = "generationConfig")]
    generation_config: GenerationConfig,
}

#[derive(Serialize)]
struct Content {
    role: &'static str,
    parts: Vec<Part>,
}

#[derive(Serialize)]
struct SystemInstruction {
    parts: Vec<Part>,
}

#[derive(Serialize)]
struct Part {
    text: String,
}

#[derive(Serialize)]
struct GenerationConfig {
    #[serde(rename = "maxOutputTokens", skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Deserialize)]
struct GenerateResponse {
    #[serde(default)]
    candidates: Vec<Candidate>,
    #[serde(rename = "usageMetadata")]
    usage_metadata: Option<UsageMetadata>,
}

#[derive(Deserialize)]
struct Candidate {
    content: Option<CandidateContent>,
}

#[derive(Deserialize)]
struct CandidateContent {
    #[serde(default)]
    parts: Vec<ResponsePart>,
}

#[derive(Deserialize)]
struct ResponsePart {
    text: Option<String>,
}

#[derive(Deserialize)]
struct UsageMetadata {
    #[serde(rename = "promptTokenCount")]
    prompt_token_count: Option<u32>,
    #[serde(rename = "candidatesTokenCount")]
    candidates_token_count: Option<u32>,
    #[serde(rename = "totalTokenCount")]
    total_token_count: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::traits::ChatMessage;

    fn message(role: MessageRole, content: &str) -> ChatMessage {
        ChatMessage {
            role,
            content: content.into(),
        }
    }

    #[test]
    fn system_becomes_instruction_and_roles_map() {
        let body = build_request_body(ChatRequest {
            messages: vec![
                message(MessageRole::System, "Be brief."),
                message(MessageRole::User, "Hi"),
                message(MessageRole::Assistant, "Hello!"),
            ],
            max_tokens: Some(100),
            purpose: Default::default(),
            temperature: None,
        });
        assert!(body.system_instruction.is_some());
        assert_eq!(body.contents.len(), 2);
        assert_eq!(body.contents[0].role, "user");
        assert_eq!(body.contents[1].role, "model");
    }

    #[test]
    fn merges_consecutive_same_role_turns() {
        /* RAG context and the question both arrive as user turns; Gemini
        requires alternation, so they must merge into one content entry. */
        let body = build_request_body(ChatRequest {
            messages: vec![
                message(MessageRole::User, "Context: ..."),
                message(MessageRole::User, "Question: ..."),
            ],
            max_tokens: None,
            temperature: None,
            purpose: Default::default(),
        });
        assert_eq!(body.contents.len(), 1);
        assert_eq!(body.contents[0].parts.len(), 2);
    }

    #[test]
    fn parses_candidate_text_and_usage() {
        let response: GenerateResponse = serde_json::from_str(
            r#"{
                "candidates": [
                    {"content": {"parts": [{"text": "Hello "}, {"text": "world"}]}}
                ],
                "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 3, "totalTokenCount": 10}
            }"#,
        )
        .unwrap();
        let parsed = parse_response(response, "gemini-2.5-flash").unwrap();
        assert_eq!(parsed.content, "Hello world");
        assert_eq!(parsed.model, "gemini-2.5-flash");
        assert_eq!(parsed.usage.unwrap().total_tokens, 10);
    }

    #[test]
    fn rejects_empty_candidates() {
        let response: GenerateResponse = serde_json::from_str(r#"{"candidates": []}"#).unwrap();
        assert!(parse_response(response, "m").is_err());
    }
}
