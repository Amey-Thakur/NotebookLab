/*
 * Title: providers/mod.rs
 * Tech Stack: Rust
 * Description: LLM provider abstraction layer. Defines the LlmProvider trait that all
 *   inference backends must implement.
 * Important Details: Providers are pluggable. Adding a new provider means implementing
 *   the trait and registering it in the router. Supports llama.cpp sidecar, OpenAI,
 *   Anthropic, Google AI, Ollama, and LM Studio.
 */
