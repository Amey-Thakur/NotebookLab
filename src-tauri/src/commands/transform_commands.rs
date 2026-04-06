/*
 * Title: transform_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri commands for content transformations.
 * Important Details: Split into phases to release db lock before the blocking LLM call.
 *   Chunks are fetched and capped at ~8000 tokens at the DB phase, then the LLM phase
 *   runs without holding any database lock.
 */

use tauri::State;

use crate::database::repository::chunk_repository;
use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole};
use crate::services::transform_service::TransformType;
use crate::state::AppState;


const TRANSFORM_PROMPT: &str = include_str!("../../resources/prompts/content-transform.txt");


#[tauri::command]
pub fn transform_document(
    state: State<'_, AppState>,
    document_id: String,
    transform_type: TransformType,
    custom_prompt: Option<String>,
) -> AppResult<String> {
    if document_id.trim().is_empty() {
        return Err(AppError::InvalidInput("Document ID is required".into()));
    }

    /* Phase 1: DB read -- fetch chunks, cap at ~8000 tokens, release lock */
    let (text, instruction) = {
        let conn = state.conn()?;
        let chunks = chunk_repository::get_by_document(&conn, &document_id)?;

        if chunks.is_empty() {
            return Err(AppError::InvalidInput(
                "Document has no content to transform. It may still be processing.".into(),
            ));
        }

        let mut text = String::new();
        let mut token_estimate = 0;
        for chunk in &chunks {
            if token_estimate > 8000 {
                break;
            }
            if !text.is_empty() {
                text.push_str("\n\n");
            }
            text.push_str(&chunk.content);
            token_estimate += chunk.token_count.max(0) as usize;
        }

        let instruction = transform_type.instruction(custom_prompt.as_deref());
        (text, instruction)
    };

    /* Phase 2: LLM call -- no db lock held */
    let providers = state.provider()?;
    let response = providers.chat_completion(ChatRequest {
        messages: vec![
            ChatMessage { role: MessageRole::System, content: TRANSFORM_PROMPT.to_string() },
            ChatMessage { role: MessageRole::User, content: format!("{instruction}\n\n<document_text>\n{text}\n</document_text>") },
        ],
        max_tokens: Some(2048),
        temperature: Some(0.3),
    }).map_err(|e| AppError::Provider(e.to_string()))?;

    Ok(response.content)
}
