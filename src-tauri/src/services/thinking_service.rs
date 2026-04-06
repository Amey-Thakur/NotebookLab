/*
 * Title: thinking_service.rs
 * Tech Stack: Rust
 * Description: Thinking Partner service. Generates mind maps, Socratic questions,
 *   and discovers cross-document connections using the LLM provider.
 * Important Details: Each operation follows the same pattern as RAG: gather context
 *   from document chunks, build a prompt, call the LLM. Mind map output is structured
 *   JSON for the frontend d3-force renderer. Socratic questions are plain text.
 */

use rusqlite::Connection;

use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole, ProviderRouter};
use crate::services::search_service;


const MIND_MAP_PROMPT: &str = include_str!("../../resources/prompts/mind-map.txt");
const SOCRATIC_PROMPT: &str = include_str!("../../resources/prompts/socratic.txt");


/// Generate a mind map from document chunks in a notebook.
/// Returns JSON string parseable by the frontend mind map renderer.
pub fn generate_mind_map(
    conn: &Connection,
    providers: &ProviderRouter,
    notebook_id: &str,
    topic: &str,
) -> AppResult<String> {
    let chunks = search_service::search_chunks(conn, notebook_id, topic, 15)?;

    if chunks.is_empty() {
        return Err(AppError::InvalidInput(
            "No relevant documents found for this topic. Import documents first.".into(),
        ));
    }

    let context = chunks
        .iter()
        .map(|c| c.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");

    let messages = vec![
        ChatMessage {
            role: MessageRole::System,
            content: MIND_MAP_PROMPT.to_string(),
        },
        ChatMessage {
            role: MessageRole::User,
            content: format!("<document_context>\n{context}\n</document_context>\n\nGenerate a mind map about: {topic}"),
        },
    ];

    let response = providers
        .chat_completion(ChatRequest {
            messages,
            max_tokens: Some(2048),
            temperature: Some(0.3),
        })
        .map_err(|e| AppError::Provider(e.to_string()))?;

    Ok(response.content)
}


/// Generate Socratic questions based on the user's documents and current thinking.
pub fn generate_socratic_questions(
    conn: &Connection,
    providers: &ProviderRouter,
    notebook_id: &str,
    user_thinking: &str,
) -> AppResult<String> {
    let chunks = search_service::search_chunks(conn, notebook_id, user_thinking, 10)?;

    let context = chunks
        .iter()
        .map(|c| c.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n---\n\n");

    let messages = vec![
        ChatMessage {
            role: MessageRole::System,
            content: SOCRATIC_PROMPT.to_string(),
        },
        ChatMessage {
            role: MessageRole::User,
            content: format!(
                "<document_context>\n{context}\n</document_context>\n\nMy current thinking:\n{user_thinking}\n\nAsk me probing questions."
            ),
        },
    ];

    let response = providers
        .chat_completion(ChatRequest {
            messages,
            max_tokens: Some(1024),
            temperature: Some(0.7),
        })
        .map_err(|e| AppError::Provider(e.to_string()))?;

    Ok(response.content)
}
