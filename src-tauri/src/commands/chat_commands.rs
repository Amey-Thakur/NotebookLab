/*
 * Name: chat_commands.rs
 * Purpose: Tauri command handlers for RAG-powered chat conversations.
 * Description: send_chat_message is async and runs on a blocking worker
 *   thread; sync commands execute on the main thread in Tauri v2,
 *   so a 30-120s LLM call would otherwise freeze every other IPC
 *   call. The pipeline is split into 3 phases so the DB lock is
 *   released before the LLM HTTP call.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use tauri::{Manager, State};

use crate::database::models::{Conversation, Message};
use crate::database::repository::conversation_repository::{self, CitationSource};
use crate::error::{AppError, AppResult};
use crate::services::rag_service;
use crate::state::AppState;

#[derive(serde::Serialize)]
pub struct ChatResponse {
    pub message_id: String,
    pub content: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn start_chat(
    state: State<'_, AppState>,
    notebook_id: String,
    title: Option<String>,
) -> AppResult<String> {
    let conn = state.conn()?;
    rag_service::start_conversation(&conn, &notebook_id, title)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn send_chat_message(
    app: tauri::AppHandle,
    conversation_id: String,
    notebook_id: String,
    message: String,
) -> AppResult<ChatResponse> {
    if message.trim().is_empty() {
        return Err(AppError::InvalidInput("Message cannot be empty".into()));
    }

    if message.chars().count() > 50_000 {
        return Err(AppError::InvalidInput(
            "Message too long (max 50,000 characters)".into(),
        ));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let state: State<'_, AppState> = app.state();

        /* Phase 0: Embed the question for semantic retrieval, when supported,
        and read the planned model's context window so retrieval packs to what
        will actually fit. Read lock only; other reads proceed concurrently. */
        let (query_vector, context_window) = {
            let providers = state.provider_read()?;
            (
                providers.embed(&message).ok().flatten(),
                providers.planned_context_window(),
            )
        };

        /* Phase 1: DB read (search + history). Lock released after this block. */
        let rag_context = {
            let conn = state.conn()?;
            rag_service::prepare_rag_context(
                &conn,
                &conversation_id,
                &notebook_id,
                &message,
                query_vector.as_deref(),
                context_window,
            )?
        };

        /* Phase 2: LLM call. No db lock held. Other commands can proceed. */
        let response_content = {
            let providers = state.provider_read()?;
            rag_service::call_llm(&providers, &rag_context)?
        };

        /* Phase 3: Save response + citations. Re-acquire DB lock. */
        let message_id = {
            let conn = state.conn()?;
            rag_service::save_response(
                &conn,
                &conversation_id,
                &response_content,
                &rag_context.sources,
            )?
        };

        Ok(ChatResponse {
            message_id,
            content: response_content,
        })
    })
    .await
    .map_err(|e| AppError::Internal(format!("Chat task failed: {e}")))?
}

/// Fetch the sources cited by an assistant message for display in the chat UI.
#[tauri::command(rename_all = "snake_case")]
pub fn get_message_citations(
    state: State<'_, AppState>,
    message_id: String,
) -> AppResult<Vec<CitationSource>> {
    let conn = state.conn()?;
    conversation_repository::get_citation_sources(&conn, &message_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_conversations(
    state: State<'_, AppState>,
    notebook_id: String,
) -> AppResult<Vec<Conversation>> {
    let conn = state.conn()?;
    conversation_repository::list_by_notebook(&conn, &notebook_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_chat_messages(
    state: State<'_, AppState>,
    conversation_id: String,
) -> AppResult<Vec<Message>> {
    let conn = state.conn()?;
    conversation_repository::get_messages(&conn, &conversation_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_conversation(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    conversation_repository::delete_conversation(&conn, &id)
}
