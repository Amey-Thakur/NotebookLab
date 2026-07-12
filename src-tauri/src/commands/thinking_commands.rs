/*
 * Name: thinking_commands.rs
 * Purpose: Tauri commands for the Thinking Partner feature.
 * Description: Async commands running on blocking worker threads; sync
 *   commands would hold the main thread through the LLM call. DB
 *   and LLM phases are split so the database lock is released
 *   before the HTTP request.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use tauri::{Manager, State};

use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole};
use crate::services::search_service;
use crate::state::AppState;

const MIND_MAP_PROMPT: &str = include_str!("../../resources/prompts/mind-map.txt");
const SOCRATIC_PROMPT: &str = include_str!("../../resources/prompts/socratic.txt");

#[tauri::command(rename_all = "snake_case")]
pub async fn generate_mind_map(
    app: tauri::AppHandle,
    notebook_id: String,
    topic: String,
) -> AppResult<String> {
    if topic.trim().is_empty() {
        return Err(AppError::InvalidInput("Topic cannot be empty".into()));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let state: State<'_, AppState> = app.state();

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
        let providers = state.provider_read()?;
        let response = providers.chat_completion(ChatRequest {
            messages: vec![
                ChatMessage { role: MessageRole::System, content: MIND_MAP_PROMPT.to_string() },
                ChatMessage { role: MessageRole::User, content: format!("<document_context>\n{context}\n</document_context>\n\nGenerate a mind map about: {topic}") },
            ],
            max_tokens: Some(2048),
            temperature: Some(0.3),
        }).map_err(|e| AppError::Provider(e.to_string()))?;

        Ok(response.content)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Mind map task failed: {e}")))?
}

#[tauri::command(rename_all = "snake_case")]
pub async fn generate_socratic_questions(
    app: tauri::AppHandle,
    notebook_id: String,
    thinking: String,
) -> AppResult<String> {
    if thinking.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "Describe your current thinking first".into(),
        ));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let state: State<'_, AppState> = app.state();

        /* Phase 1: DB read */
        let context = {
            let conn = state.conn()?;
            let chunks = search_service::search_chunks(&conn, &notebook_id, &thinking, 10)?;
            if chunks.is_empty() {
                return Err(AppError::InvalidInput(
                    "No relevant documents found. Import documents first.".into(),
                ));
            }
            chunks.iter().map(|c| c.content.clone()).collect::<Vec<_>>().join("\n\n---\n\n")
        };

        /* Phase 2: LLM call */
        let providers = state.provider_read()?;
        let response = providers.chat_completion(ChatRequest {
            messages: vec![
                ChatMessage { role: MessageRole::System, content: SOCRATIC_PROMPT.to_string() },
                ChatMessage { role: MessageRole::User, content: format!("<document_context>\n{context}\n</document_context>\n\nMy current thinking:\n{thinking}\n\nAsk me probing questions.") },
            ],
            max_tokens: Some(1024),
            temperature: Some(0.7),
        }).map_err(|e| AppError::Provider(e.to_string()))?;

        Ok(response.content)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Socratic task failed: {e}")))?
}
