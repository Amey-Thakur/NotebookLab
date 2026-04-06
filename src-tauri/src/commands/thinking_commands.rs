/*
 * Title: thinking_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri commands for the Thinking Partner feature.
 * Important Details: Commands split DB and LLM phases to release the database lock
 *   before the blocking HTTP call, matching the chat_commands pattern.
 */

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole};
use crate::services::search_service;
use crate::state::AppState;


const MIND_MAP_PROMPT: &str = include_str!("../../resources/prompts/mind-map.txt");
const SOCRATIC_PROMPT: &str = include_str!("../../resources/prompts/socratic.txt");


#[tauri::command]
pub fn generate_mind_map(
    state: State<'_, AppState>,
    notebook_id: String,
    topic: String,
) -> AppResult<String> {
    if topic.trim().is_empty() {
        return Err(AppError::InvalidInput("Topic cannot be empty".into()));
    }

    /* Phase 1: DB read -- search chunks, release lock */
    let context = {
        let conn = state.conn()?;
        let chunks = search_service::search_chunks(&conn, &notebook_id, &topic, 15)?;
        if chunks.is_empty() {
            return Err(AppError::InvalidInput(
                "No relevant documents found for this topic. Import documents first.".into(),
            ));
        }
        chunks.iter().map(|c| c.content.clone()).collect::<Vec<_>>().join("\n\n---\n\n")
    };

    /* Phase 2: LLM call -- no db lock held */
    let providers = state.provider()?;
    let response = providers.chat_completion(ChatRequest {
        messages: vec![
            ChatMessage { role: MessageRole::System, content: MIND_MAP_PROMPT.to_string() },
            ChatMessage { role: MessageRole::User, content: format!("<document_context>\n{context}\n</document_context>\n\nGenerate a mind map about: {topic}") },
        ],
        max_tokens: Some(2048),
        temperature: Some(0.3),
    }).map_err(|e| AppError::Provider(e.to_string()))?;

    Ok(response.content)
}


#[tauri::command]
pub fn generate_socratic_questions(
    state: State<'_, AppState>,
    notebook_id: String,
    thinking: String,
) -> AppResult<String> {
    if thinking.trim().is_empty() {
        return Err(AppError::InvalidInput("Describe your current thinking first".into()));
    }

    /* Phase 1: DB read */
    let context = {
        let conn = state.conn()?;
        let chunks = search_service::search_chunks(&conn, &notebook_id, &thinking, 10)?;
        chunks.iter().map(|c| c.content.clone()).collect::<Vec<_>>().join("\n\n---\n\n")
    };

    /* Phase 2: LLM call */
    let providers = state.provider()?;
    let response = providers.chat_completion(ChatRequest {
        messages: vec![
            ChatMessage { role: MessageRole::System, content: SOCRATIC_PROMPT.to_string() },
            ChatMessage { role: MessageRole::User, content: format!("<document_context>\n{context}\n</document_context>\n\nMy current thinking:\n{thinking}\n\nAsk me probing questions.") },
        ],
        max_tokens: Some(1024),
        temperature: Some(0.7),
    }).map_err(|e| AppError::Provider(e.to_string()))?;

    Ok(response.content)
}
