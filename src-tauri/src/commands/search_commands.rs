/*
 * Title: search_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri command handlers for search operations across notebooks.
 * Important Details: Searches across document chunks and note titles/content within
 *   a notebook. Results include source metadata for display in the search UI.
 *   FTS5 indexing will replace LIKE-based search when integrated.
 */

use tauri::State;

use crate::database::models::Note;
use crate::database::repository::note_repository;
use crate::error::{AppError, AppResult};
use crate::services::search_service::{self, SearchResult};
use crate::state::AppState;


#[derive(serde::Serialize)]
pub struct UnifiedSearchResult {
    pub chunks: Vec<SearchResult>,
    pub notes: Vec<Note>,
}


#[tauri::command]
pub fn search(
    state: State<'_, AppState>,
    notebook_id: String,
    query: String,
) -> AppResult<UnifiedSearchResult> {
    if query.trim().is_empty() {
        return Err(AppError::InvalidInput("Search query cannot be empty".into()));
    }

    let conn = state.conn()?;

    let chunks = search_service::search_chunks(&conn, &notebook_id, &query, 20)?;
    let notes = note_repository::search_by_title(&conn, &notebook_id, &query)?;

    Ok(UnifiedSearchResult { chunks, notes })
}
