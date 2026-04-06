/*
 * Title: providers/mod.rs
 * Tech Stack: Rust
 * Description: LLM provider abstraction layer. Pluggable backends for inference.
 * Important Details: The OpenAiCompatibleProvider covers llama.cpp, OpenAI, Ollama,
 *   and LM Studio since they all expose the /v1/chat/completions endpoint.
 *   Adding Anthropic or Google AI requires a dedicated provider implementation
 *   because their APIs differ from the OpenAI format.
 */

pub mod openai_compatible;
pub mod router;
pub mod traits;

pub use router::{ProviderInfo, ProviderRouter};
pub use traits::{ChatMessage, ChatRequest, ChatResponse, LlmProvider, MessageRole, ProviderError};
