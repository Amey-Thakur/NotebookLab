/*
 * Name: mod.rs
 * Purpose: LLM provider abstraction layer.
 * Description: Pluggable backends for inference. The OpenAiCompatibleProvider
 *   covers llama.cpp, OpenAI, DeepSeek, Ollama, and LM Studio since
 *   they all expose the /v1/chat/completions endpoint. Anthropic
 *   (Claude) and Google (Gemini) speak their own wire formats and
 *   have dedicated providers. Adding a new backend = implement the
 *   LlmProvider trait and map a kind in provider_config_service.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

pub mod anthropic;
pub mod auto_select;
pub mod gemini;
pub mod openai_compatible;
pub mod router;
pub mod traits;

pub use router::{ProviderInfo, ProviderRouter};
#[allow(unused_imports)]
pub use traits::{
    ChatMessage, ChatRequest, ChatResponse, LlmProvider, MessageRole, ProviderError, TaskPurpose,
};
