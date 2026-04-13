/*
 * Title: chat_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri command handlers for RAG-powered chat conversations.
 * Important Details: send_chat_message splits the RAG pipeline into 3 phases to
 *   minimize lock duration. DB lock is released before the LLM HTTP call (which can
 *   take 30-120s) so other commands are not blocked during inference.
 */

use tauri::State;

use crate::database::models::{Conversation, Message};
use crate::database::repository::conversation_repository;
use crate::error::{AppError, AppResult};
use crate::services::rag_service;
use crate::state::AppState;


#[derive(serde::Serialize)]
pub struct ChatResponse {
    pub message_id: String,
    pub content: String,
}


#[tauri::command]
pub fn start_chat(
    state: State<'_, AppState>,
    notebook_id: String,
    title: Option<String>,
) -> AppResult<String> {
    let conn = state.conn()?;
    rag_service::start_conversation(&conn, &notebook_id, title)
}


#[tauri::command]
pub fn send_chat_message(
    state: State<'_, AppState>,
    conversation_id: String,
    notebook_id: String,
    message: String,
) -> AppResult<ChatResponse> {
    if message.trim().is_empty() {
        return Err(AppError::InvalidInput("Message cannot be empty".into()));
    }

    if message.len() > 50_000 {
        return Err(AppError::InvalidInput("Message too long (max 50,000 characters)".into()));
    }

    /* Phase 1: DB read (search + history). Lock released after this block. */
    let rag_context = {
        let conn = state.conn()?;
        rag_service::prepare_rag_context(&conn, &conversation_id, &notebook_id, &message)?
    };

    /* Phase 2: LLM call. No db lock held. Other commands can proceed. */
    let response_content = {
        let providers = state.provider()?;
        rag_service::call_llm(&providers, &rag_context)?
    };

    /* Phase 3: Save response + citations. Re-acquire DB lock. */
    let message_id = {
        let conn = state.conn()?;
        rag_service::save_response(&conn, &conversation_id, &response_content, &rag_context.chunk_ids)?
    };

    Ok(ChatResponse { message_id, content: response_content })
}


#[tauri::command]
pub fn list_conversations(
    state: State<'_, AppState>,
    notebook_id: String,
) -> AppResult<Vec<Conversation>> {
    let conn = state.conn()?;
    conversation_repository::list_by_notebook(&conn, &notebook_id)
}


#[tauri::command]
pub fn get_chat_messages(
    state: State<'_, AppState>,
    conversation_id: String,
) -> AppResult<Vec<Message>> {
    let conn = state.conn()?;
    conversation_repository::get_messages(&conn, &conversation_id)
}


#[tauri::command]
pub fn delete_conversation(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let conn = state.conn()?;
    conversation_repository::delete_conversation(&conn, &id)
}
