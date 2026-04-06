/*
 * Title: document_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri command handlers for document operations including import,
 *   listing, and deletion.
 * Important Details: The import_document command triggers the full ingestion pipeline
 *   (parse -> chunk -> store). File paths are validated before processing.
 */

use std::path::PathBuf;

use tauri::State;

use crate::database::models::Document;
use crate::database::repository::{chunk_repository, document_repository};
use crate::error::{AppError, AppResult};
use crate::services::ingestion_service;
use crate::state::AppState;


#[tauri::command]
pub fn import_document(
    state: State<'_, AppState>,
    notebook_id: String,
    file_path: String,
) -> AppResult<String> {
    let conn = state.conn()?;
    let path = PathBuf::from(&file_path);

    /* Validate the path exists and is a regular file (not a directory or symlink) */
    if !path.exists() {
        return Err(AppError::InvalidInput("File does not exist".into()));
    }
    if !path.is_file() {
        return Err(AppError::InvalidInput("Path is not a regular file".into()));
    }

    /* Canonicalize to resolve symlinks and .. traversal */
    let canonical = path.canonicalize().map_err(|_| {
        AppError::InvalidInput("Could not resolve file path".into())
    })?;

    ingestion_service::ingest_file(&conn, &notebook_id, &canonical)
}


#[tauri::command]
pub fn list_documents(
    state: State<'_, AppState>,
    notebook_id: String,
) -> AppResult<Vec<Document>> {
    let conn = state.conn()?;
    document_repository::list_by_notebook(&conn, &notebook_id)
}


#[tauri::command]
pub fn get_document(state: State<'_, AppState>, id: String) -> AppResult<Document> {
    let conn = state.conn()?;
    document_repository::get_by_id(&conn, &id)
}


#[tauri::command]
pub fn delete_document(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    document_repository::delete(&conn, &id)
}


#[tauri::command]
pub fn get_document_chunks(
    state: State<'_, AppState>,
    document_id: String,
) -> AppResult<Vec<crate::database::models::Chunk>> {
    let conn = state.conn()?;
    chunk_repository::get_by_document(&conn, &document_id)
}


#[tauri::command]
pub fn get_chunk_count(state: State<'_, AppState>) -> AppResult<i64> {
    let conn = state.conn()?;
    chunk_repository::count_all(&conn)
}
