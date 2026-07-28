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

use crate::database::repository::chunk_repository;
use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole, TaskPurpose};
use crate::services::search_service;
use crate::state::AppState;

/// Gather passages for a thinking prompt: the best keyword matches for the
/// topic, or a spread across the notebook when nothing matches.
///
/// A topic worded differently from the documents (or simply mistyped) finds
/// nothing by keyword even when the notebook is full, and the old behaviour
/// told the user to import documents they had already imported. Falling back
/// to a sample keeps the feature working on the sources that are actually
/// there; only a genuinely empty notebook is an error.
fn gather_context(
    conn: &rusqlite::Connection,
    notebook_id: &str,
    topic: &str,
    limit: usize,
) -> AppResult<String> {
    let matches = search_service::search_chunks(conn, notebook_id, topic, limit)?;
    let passages: Vec<String> = if matches.is_empty() {
        chunk_repository::sample_for_notebook(conn, notebook_id, limit)?
    } else {
        matches.into_iter().map(|c| c.content).collect()
    };

    if passages.is_empty() {
        return Err(AppError::InvalidInput(
            "This notebook has no documents yet. Import one first.".into(),
        ));
    }

    Ok(passages.join("\n\n---\n\n"))
}

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

        /* Phase 1: DB read -- gather passages, release lock */
        let context = {
            let conn = state.conn()?;
            gather_context(&conn, &notebook_id, &topic, 15)?
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
            purpose: TaskPurpose::Quality,
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
            gather_context(&conn, &notebook_id, &thinking, 10)?
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
            purpose: TaskPurpose::Quality,
        }).map_err(|e| AppError::Provider(e.to_string()))?;

        Ok(response.content)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Socratic task failed: {e}")))?
}
