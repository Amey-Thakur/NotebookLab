/*
 * Title: chat_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri command handlers for RAG-powered chat conversations.
 * Important Details: The send_chat_message command triggers the full RAG pipeline:
 *   search chunks -> assemble context -> call LLM -> save response + citations.
 *   Both database and provider locks are acquired for the send operation.
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

    let conn = state.conn()?;
    let providers = state.providers.lock()
        .map_err(|_| AppError::Internal("Provider lock poisoned".into()))?;

    let (message_id, content) = rag_service::send_message(
        &conn,
        &providers,
        &conversation_id,
        &notebook_id,
        &message,
    )?;

    Ok(ChatResponse { message_id, content })
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
