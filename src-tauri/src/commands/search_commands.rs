/*
 * Name: search_commands.rs
 * Purpose: Tauri command handlers for search operations across notebooks.
 * Description: Async on a blocking worker because embedding the query is an
 *   HTTP call. Blends FTS5 keyword ranking with vector similarity
 *   when the active provider supports embeddings; otherwise
 *   keyword search alone.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use tauri::{Manager, State};

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

#[tauri::command(rename_all = "snake_case")]
pub async fn search(
    app: tauri::AppHandle,
    notebook_id: String,
    query: String,
) -> AppResult<UnifiedSearchResult> {
    if query.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "Search query cannot be empty".into(),
        ));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let state: State<'_, AppState> = app.state();

        /* Embed the query first (no DB lock held during the HTTP call) */
        let query_vector = {
            let providers = state.provider_read()?;
            providers.embed(&query).ok().flatten()
        };

        let conn = state.conn()?;
        let chunks = search_service::search_chunks_hybrid(
            &conn,
            &notebook_id,
            &query,
            query_vector.as_deref(),
            20,
        )?;
        let notes = note_repository::search_by_title(&conn, &notebook_id, &query)?;

        Ok(UnifiedSearchResult { chunks, notes })
    })
    .await
    .map_err(|e| AppError::Internal(format!("Search task failed: {e}")))?
}
