/*
 * Name: document_commands.rs
 * Purpose: Tauri command handlers for document operations including import,
 *   listing, and deletion.
 * Description: import_document is async so parsing a large PDF never blocks
 *   the main thread. After ingestion it kicks off a background
 *   embedding pass; failures there degrade search to keyword-only
 *   rather than erroring.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use std::path::PathBuf;

use tauri::{Manager, State};

use crate::database::models::Document;
use crate::database::repository::{chunk_repository, document_repository};
use crate::error::{AppError, AppResult};
use crate::services::{embedding_service, ingestion_service};
use crate::state::AppState;

#[tauri::command(rename_all = "snake_case")]
pub async fn import_document(
    app: tauri::AppHandle,
    notebook_id: String,
    file_path: String,
) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(&file_path);

        /* Validate the path exists and is a regular file (not a directory or symlink) */
        if !path.exists() {
            return Err(AppError::InvalidInput("File does not exist".into()));
        }
        if !path.is_file() {
            return Err(AppError::InvalidInput("Path is not a regular file".into()));
        }

        /* Canonicalize to resolve symlinks and .. traversal */
        let canonical = path
            .canonicalize()
            .map_err(|_| AppError::InvalidInput("Could not resolve file path".into()))?;

        let document_id = {
            let state: State<'_, AppState> = app.state();

            /* Build the OCR engine only for image imports so text formats never
            pay to load the models. This runs before the database lock is taken. */
            let is_image = canonical
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(crate::parsers::is_ocr_image_extension);
            let ocr = if is_image {
                state.ocr_engine(&app)
            } else {
                None
            };

            /* Run the pipeline in three phases so the database lock is released
            across the parse. Parsing a large PDF or running OCR on an image can
            take seconds; holding the single shared connection lock that whole
            time would freeze every other database command. */
            let prepared = {
                let conn = state.conn()?;
                ingestion_service::prepare_ingest(&conn, &notebook_id, &canonical)?
            };

            match ingestion_service::parse_and_chunk(&prepared.doc_id, &canonical, ocr) {
                Ok(chunks) => {
                    let conn = state.conn()?;
                    ingestion_service::finalize_ingest(&conn, &prepared.doc_id, chunks)?;
                }
                Err(e) => {
                    if let Ok(conn) = state.conn() {
                        ingestion_service::mark_ingest_error(&conn, &prepared.doc_id);
                    }
                    return Err(e);
                }
            }

            prepared.doc_id
        };

        /* Embed the new chunks in the background so semantic search covers
        this document. Purely additive: keyword search works regardless. */
        embedding_service::spawn_embedding_pass(app.clone(), document_id.clone());

        Ok(document_id)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Import task failed: {e}")))?
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_documents(state: State<'_, AppState>, notebook_id: String) -> AppResult<Vec<Document>> {
    let conn = state.conn()?;
    document_repository::list_by_notebook(&conn, &notebook_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_document(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    document_repository::delete(&conn, &id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_document_chunks(
    state: State<'_, AppState>,
    document_id: String,
) -> AppResult<Vec<crate::database::models::Chunk>> {
    let conn = state.conn()?;
    chunk_repository::get_by_document(&conn, &document_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_chunk_count(state: State<'_, AppState>) -> AppResult<i64> {
    let conn = state.conn()?;
    chunk_repository::count_all(&conn)
}
