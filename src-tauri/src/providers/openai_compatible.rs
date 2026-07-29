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
            /* A timeout prevents hanging on unresponsive providers. A model on
            this machine is free but slow: a 7B answering on CPU can take
            several minutes, and cutting it off at the cloud's 120s turned a
            working setup into an error. Cloud endpoints that go quiet are
            failing, so they keep the shorter limit. */
            client: Client::builder()
                .timeout(if is_local {
                    LOCAL_REQUEST_TIMEOUT
                } else {
                    CLOUD_REQUEST_TIMEOUT
                })
                .connect_timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }
}

/// How long to wait for a model running on this computer.
///
/// This was four minutes, chosen so a stalled provider could not leave the user
/// "staring at a spinner". That reasoning no longer holds, and the limit was
/// cutting off work that was going perfectly well: a 2000-token script from a
/// local model on a CPU runs at a few tokens a second, which is fifteen minutes
/// of legitimate work, and every feature failed at exactly 4m00s with "the model
/// did not answer in time" while the model was still writing.
///
/// There is no blind spinner any more. A generation reports its phase, a
/// percentage and an estimate, and the user can stop it whenever they like. So
/// the ceiling exists only to catch a server that has genuinely died, and it can
/// be generous enough not to punish a slow machine for being slow.
const LOCAL_REQUEST_TIMEOUT: Duration = Duration::from_secs(1800);
/// How long to wait for a hosted endpoint.
const CLOUD_REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

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

        let response = req.send().map_err(|e| {
            ProviderError::RequestFailed(super::traits::describe_transport_error(&e))
        })?;

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

        /* Local reasoning models (DeepSeek R1 and kin) prefix their answer
        with a <think> monologue; keep only the answer the user asked for. */
        let content =
            crate::utils::text_utils::strip_reasoning_block(&choice.message.content).to_string();

        Ok(ChatResponse {
            content,
            model: api_response.model,
            usage: api_response.usage.map(|u| TokenUsage {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: u.total_tokens,
            }),
        })
    }

    fn supports_streaming(&self) -> bool {
        true
    }

    /// Stream a completion, reporting each fragment as the model writes it.
    ///
    /// Reads the response body line by line rather than buffering it, so the
    /// first token reaches the caller in the time the model takes to produce
    /// one instead of the time it takes to finish. On a local model that is the
    /// difference between a few seconds and several minutes of silence.
    fn stream_chat_completion(
        &self,
        request: ChatRequest,
        on_token: &mut dyn FnMut(&str),
    ) -> Result<ChatResponse, ProviderError> {
        use std::io::{BufRead, BufReader};

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
            stream: true,
        };

        let mut req = self.client.post(&url).json(&body);
        if let Some(ref key) = self.api_key {
            req = req.bearer_auth(key);
        }

        let response = req.send().map_err(|e| {
            ProviderError::RequestFailed(super::traits::describe_transport_error(&e))
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().unwrap_or_default();
            let truncated = crate::utils::text_utils::truncate_to_char_boundary(&text, 200);
            return Err(ProviderError::RequestFailed(format!(
                "HTTP {status}: {truncated}"
            )));
        }

        let mut answer = String::new();
        let reader = BufReader::new(response);
        for line in reader.lines() {
            let line = line.map_err(|e| {
                ProviderError::InvalidResponse(format!("The stream ended early: {e}"))
            })?;
            match parse_stream_line(&line) {
                StreamEvent::Token(text) => {
                    on_token(&text);
                    answer.push_str(&text);
                }
                StreamEvent::Done => break,
                StreamEvent::Ignore => {}
            }
        }

        if answer.trim().is_empty() {
            return Err(ProviderError::InvalidResponse(
                "The model returned an empty answer.".into(),
            ));
        }

        /* Local reasoning models (DeepSeek R1 and kin) prefix their answer with
        a <think> monologue. It is stripped here, at the end, because the block
        spans many fragments and cannot be recognised from one alone. */
        Ok(ChatResponse {
            content: crate::utils::text_utils::strip_reasoning_block(&answer).to_string(),
            model: self.model.clone(),
            /* Streamed responses carry usage only if the server was asked for
            it, and not every one supports that; the caller treats None as
            "unknown" rather than zero. */
            usage: None,
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

/// One chunk of a streamed completion, in the OpenAI shape every compatible
/// server emits: `{"choices":[{"delta":{"content":"..."}}]}`.
#[derive(Deserialize)]
struct StreamChunk {
    #[serde(default)]
    choices: Vec<StreamChoice>,
    #[serde(default)]
    usage: Option<ApiUsage>,
}

#[derive(Deserialize)]
struct StreamChoice {
    #[serde(default)]
    delta: StreamDelta,
}

#[derive(Deserialize, Default)]
struct StreamDelta {
    #[serde(default)]
    content: Option<String>,
}

/// What a single line of the event stream meant.
#[derive(Debug, PartialEq)]
pub enum StreamEvent {
    /// Text to append to the answer.
    Token(String),
    /// The server said it is finished.
    Done,
    /// A keep-alive, a comment, or a field this client does not use.
    Ignore,
}

/// Interpret one line of a server-sent event stream.
///
/// Kept separate from the socket because this is where streaming implementations
/// usually go wrong, and it is the part that can be tested without a server: the
/// `[DONE]` sentinel is not JSON, comment lines begin with a colon, blank lines
/// separate events, and a chunk carrying no content at all is normal at the
/// start and end of a stream.
pub fn parse_stream_line(line: &str) -> StreamEvent {
    let line = line.trim();
    if line.is_empty() || line.starts_with(':') {
        return StreamEvent::Ignore;
    }
    let Some(payload) = line.strip_prefix("data:") else {
        return StreamEvent::Ignore;
    };
    let payload = payload.trim();
    if payload == "[DONE]" {
        return StreamEvent::Done;
    }
    match serde_json::from_str::<StreamChunk>(payload) {
        Ok(chunk) => match chunk
            .choices
            .into_iter()
            .next()
            .and_then(|c| c.delta.content)
        {
            Some(text) if !text.is_empty() => StreamEvent::Token(text),
            _ => StreamEvent::Ignore,
        },
        /* A malformed chunk is not worth failing a whole answer over: servers
        occasionally emit padding, and the stream recovers on the next line. */
        Err(_) => StreamEvent::Ignore,
    }
}

#[cfg(test)]
mod stream_tests {
    use super::*;

    #[test]
    fn reads_a_content_delta() {
        let line = r#"data: {"choices":[{"delta":{"content":"Hello"}}]}"#;
        assert_eq!(parse_stream_line(line), StreamEvent::Token("Hello".into()));
    }

    #[test]
    fn recognises_the_done_sentinel() {
        /* Not JSON. Parsing it as JSON is the classic way a stream ends with a
        spurious error instead of a completed answer. */
        assert_eq!(parse_stream_line("data: [DONE]"), StreamEvent::Done);
        assert_eq!(parse_stream_line("data:[DONE]"), StreamEvent::Done);
    }

    #[test]
    fn ignores_blank_lines_and_comments() {
        /* Blank lines separate events and a leading colon is a keep-alive that
        several servers send to stop proxies closing an idle connection. */
        assert_eq!(parse_stream_line(""), StreamEvent::Ignore);
        assert_eq!(parse_stream_line("   "), StreamEvent::Ignore);
        assert_eq!(parse_stream_line(": ping"), StreamEvent::Ignore);
    }

    #[test]
    fn ignores_an_empty_delta() {
        /* The first chunk usually carries only a role, and the last only a
        finish reason. Neither is text. */
        let role = r#"data: {"choices":[{"delta":{"role":"assistant"}}]}"#;
        let finish = r#"data: {"choices":[{"delta":{},"finish_reason":"stop"}]}"#;
        assert_eq!(parse_stream_line(role), StreamEvent::Ignore);
        assert_eq!(parse_stream_line(finish), StreamEvent::Ignore);
    }

    #[test]
    fn survives_a_malformed_chunk() {
        /* One bad line must not fail an otherwise good answer. */
        assert_eq!(parse_stream_line("data: {not json"), StreamEvent::Ignore);
        assert_eq!(parse_stream_line("event: message"), StreamEvent::Ignore);
    }

    #[test]
    fn keeps_whitespace_inside_a_token() {
        /* Tokens carry their own leading spaces; trimming them would run every
        word together in the finished answer. */
        let line = r#"data: {"choices":[{"delta":{"content":" world"}}]}"#;
        assert_eq!(parse_stream_line(line), StreamEvent::Token(" world".into()));
    }
}
