/*
 * Name: mod.rs
 * Purpose: LLM provider abstraction layer.
 * Description: Pluggable backends for inference. The OpenAiCompatibleProvider
 *   covers llama.cpp, OpenAI, Ollama, and LM Studio since they all
 *   expose the /v1/chat/completions endpoint. Adding Anthropic or
 *   Google AI requires a dedicated provider implementation because
 *   their APIs differ from the OpenAI format.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

pub mod openai_compatible;
pub mod router;
pub mod traits;

pub use router::{ProviderInfo, ProviderRouter};
#[allow(unused_imports)]
pub use traits::{ChatMessage, ChatRequest, ChatResponse, LlmProvider, MessageRole, ProviderError};
