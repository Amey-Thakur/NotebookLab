/*
 * Name: traits.rs
 * Purpose: Core trait defining the interface all LLM providers must
 *   implement.
 * Description: Uses synchronous signatures because Tauri v2 commands are sync
 *   by default. Providers handle their own HTTP/process
 *   communication internally. The trait is object-safe to enable
 *   dynamic dispatch via Box<dyn LlmProvider>.
 * Tech Stack: Rust, async-trait pattern
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use serde::{Deserialize, Serialize};

/// Every LLM provider (llama.cpp, OpenAI, Anthropic, etc.) implements this trait.
/// Adding a new provider = implement this trait + register in the router.
pub trait LlmProvider: Send + Sync {
    /// Human-readable name for display in the model manager UI.
    fn name(&self) -> &str;

    /// Machine-readable provider family ("sidecar", "ollama", "openai",
    /// "anthropic", "gemini", "deepseek", "lmstudio", "llamacpp", "custom").
    /// The UI uses this for grouping, icons, and provider-specific guidance.
    fn kind(&self) -> &str {
        "custom"
    }

    /// The model this provider instance sends requests to, for display in the
    /// model switcher. Empty when the provider has no fixed model.
    fn model(&self) -> &str {
        ""
    }

    /// Whether this provider requires network access (false for local models).
    fn is_local(&self) -> bool;

    /// Check if the provider is ready to accept requests.
    fn is_available(&self) -> bool;

    /// Generate a text completion from a list of messages.
    fn chat_completion(&self, request: ChatRequest) -> Result<ChatResponse, ProviderError>;

    /// Generate an embedding vector for the given text.
    /// Not all providers support this. Returns None if unsupported.
    fn embed(&self, _text: &str) -> Result<Option<Vec<f32>>, ProviderError> {
        Ok(None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: MessageRole,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
}

/// What kind of work a completion is for, so automatic model selection can
/// trade quality against speed and cost per task instead of globally.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TaskPurpose {
    /// Quick, low-stakes text where latency and cost matter most.
    Fast,
    /// Everyday conversational work: the sensible middle.
    #[default]
    Balanced,
    /// Long-form generation and hard reasoning where quality dominates.
    Quality,
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    /// Consumed by the router's automatic model selection; individual
    /// providers ignore it.
    pub purpose: TaskPurpose,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
    pub model: String,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("Provider not available: {0}")]
    NotAvailable(String),

    #[error("Request failed: {0}")]
    RequestFailed(String),

    #[error("Invalid response: {0}")]
    InvalidResponse(String),

    #[error("Configuration error: {0}")]
    Configuration(String),
}
