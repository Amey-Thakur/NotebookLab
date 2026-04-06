/*
 * Title: thinking_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri commands for the Thinking Partner feature: mind maps and
 *   Socratic questioning.
 * Important Details: Like chat, these commands split DB and LLM phases to avoid
 *   holding the database lock during inference.
 */

use tauri::State;

use crate::error::{AppError, AppResult};
use crate::services::thinking_service;
use crate::state::AppState;


#[tauri::command]
pub fn generate_mind_map(
    state: State<'_, AppState>,
    notebook_id: String,
    topic: String,
) -> AppResult<String> {
    if topic.trim().is_empty() {
        return Err(AppError::InvalidInput("Topic cannot be empty".into()));
    }

    /* Phase 1: DB read (search chunks) */
    let conn = state.conn()?;
    let providers = state.providers.lock()
        .map_err(|_| AppError::Internal("Provider lock poisoned".into()))?;

    thinking_service::generate_mind_map(&conn, &providers, &notebook_id, &topic)
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

    let conn = state.conn()?;
    let providers = state.providers.lock()
        .map_err(|_| AppError::Internal("Provider lock poisoned".into()))?;

    thinking_service::generate_socratic_questions(&conn, &providers, &notebook_id, &thinking)
}
