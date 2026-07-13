/*
 * Name: share_commands.rs
 * Purpose: Export a notebook to a self-contained file and import it back.
 * Description: Sharing solved for an offline app. A notebook is written as one
 *   portable JSON bundle holding the notebook, its notes, its documents with
 *   their extracted text chunks, and its canvas scene, so the exported file
 *   opens on any other machine with no network and no original source files.
 *   Import creates a brand-new notebook and, if any step fails, removes the
 *   half-built notebook so nothing partial is left behind. The bundle is
 *   versioned, and imports of an unknown format or a newer version are rejected
 *   with a clear message. Both commands run on a blocking worker.
 * Tech Stack: Rust, Tauri v2, serde_json
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::database::models::{
    CreateChunk, CreateDocument, CreateNote, CreateNotebook, DocumentStatus,
};
use crate::database::repository::{
    canvas_repository, chunk_repository, document_repository, note_repository, notebook_repository,
};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const BUNDLE_FORMAT: &str = "notebooklab-notebook";
const BUNDLE_VERSION: u32 = 1;
/* Cap the file we will read on import so a hostile bundle cannot exhaust memory. */
const MAX_BUNDLE_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
pub struct NotebookBundle {
    pub format: String,
    pub version: u32,
    pub notebook: BundleNotebook,
    pub notes: Vec<BundleNote>,
    pub documents: Vec<BundleDocument>,
    #[serde(default)]
    pub canvas: String,
}

#[derive(Serialize, Deserialize)]
pub struct BundleNotebook {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub color: String,
}

#[derive(Serialize, Deserialize)]
pub struct BundleNote {
    pub title: String,
    pub content: String,
}

#[derive(Serialize, Deserialize)]
pub struct BundleDocument {
    pub title: String,
    pub file_type: String,
    pub file_hash: String,
    pub file_size: i64,
    pub chunks: Vec<BundleChunk>,
}

#[derive(Serialize, Deserialize)]
pub struct BundleChunk {
    pub content: String,
    pub position: i32,
    pub page_number: Option<i32>,
    #[serde(default)]
    pub heading_context: String,
    pub token_count: i32,
}

/// Collect a notebook's contents into a portable bundle.
pub fn build_bundle(conn: &Connection, notebook_id: &str) -> AppResult<NotebookBundle> {
    let notebook = notebook_repository::get_by_id(conn, notebook_id)?;

    let notes = note_repository::list_by_notebook(conn, notebook_id)?
        .into_iter()
        .map(|note| BundleNote {
            title: note.title,
            content: note.content,
        })
        .collect();

    let mut documents = Vec::new();
    for doc in document_repository::list_by_notebook(conn, notebook_id)? {
        let chunks = chunk_repository::get_by_document(conn, &doc.id)?
            .into_iter()
            .map(|chunk| BundleChunk {
                content: chunk.content,
                position: chunk.position,
                page_number: chunk.page_number,
                heading_context: chunk.heading_context,
                token_count: chunk.token_count,
            })
            .collect();
        documents.push(BundleDocument {
            title: doc.title,
            file_type: doc.file_type,
            file_hash: doc.file_hash,
            file_size: doc.file_size,
            chunks,
        });
    }

    let canvas = canvas_repository::find_by_notebook(conn, notebook_id)?
        .map(|c| c.scene)
        .unwrap_or_default();

    Ok(NotebookBundle {
        format: BUNDLE_FORMAT.to_string(),
        version: BUNDLE_VERSION,
        notebook: BundleNotebook {
            name: notebook.name,
            description: notebook.description,
            color: notebook.color,
        },
        notes,
        documents,
        canvas,
    })
}

/// Create a new notebook from a bundle. Returns the new notebook id. On any
/// failure the partial notebook is deleted so nothing half-imported remains.
pub fn write_bundle(conn: &Connection, bundle: NotebookBundle) -> AppResult<String> {
    let optional = |value: String| if value.is_empty() { None } else { Some(value) };

    let notebook = notebook_repository::create(
        conn,
        CreateNotebook {
            name: bundle.notebook.name,
            description: optional(bundle.notebook.description),
            color: optional(bundle.notebook.color),
        },
    )?;

    match populate(
        conn,
        &notebook.id,
        bundle.notes,
        bundle.documents,
        &bundle.canvas,
    ) {
        Ok(()) => Ok(notebook.id),
        Err(e) => {
            notebook_repository::delete(conn, &notebook.id).ok();
            Err(e)
        }
    }
}

fn populate(
    conn: &Connection,
    notebook_id: &str,
    notes: Vec<BundleNote>,
    documents: Vec<BundleDocument>,
    canvas: &str,
) -> AppResult<()> {
    for note in notes {
        note_repository::create(
            conn,
            CreateNote {
                notebook_id: notebook_id.to_string(),
                title: Some(note.title),
                content: Some(note.content),
            },
        )?;
    }

    for doc in documents {
        let created = document_repository::create(
            conn,
            CreateDocument {
                notebook_id: notebook_id.to_string(),
                title: doc.title,
                file_path: "(imported)".to_string(),
                file_type: doc.file_type,
                file_hash: doc.file_hash,
                file_size: doc.file_size,
            },
        )?;

        if !doc.chunks.is_empty() {
            let chunks = doc
                .chunks
                .into_iter()
                .map(|chunk| CreateChunk {
                    document_id: created.id.clone(),
                    content: chunk.content,
                    position: chunk.position,
                    page_number: chunk.page_number,
                    heading_context: chunk.heading_context,
                    token_count: chunk.token_count,
                })
                .collect();
            chunk_repository::bulk_create(conn, chunks)?;
        }

        document_repository::update_status(conn, &created.id, DocumentStatus::Processed)?;
    }

    if !canvas.trim().is_empty() {
        let created = canvas_repository::get_or_create(conn, notebook_id)?;
        canvas_repository::update_scene(conn, &created.id, canvas)?;
    }

    Ok(())
}

/// Export a notebook to a self-contained file at `dest_path`.
#[tauri::command(rename_all = "snake_case")]
pub async fn export_notebook(
    app: tauri::AppHandle,
    notebook_id: String,
    dest_path: String,
) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppState> = app.state();
        let bundle = {
            let conn = state.conn()?;
            build_bundle(&conn, &notebook_id)?
        };
        let json = serde_json::to_string_pretty(&bundle)?;
        std::fs::write(&dest_path, json)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Export task failed: {e}")))?
}

/// Import a notebook file, creating a new notebook. Returns its id.
#[tauri::command(rename_all = "snake_case")]
pub async fn import_notebook(app: tauri::AppHandle, src_path: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let metadata = std::fs::metadata(&src_path)?;
        if metadata.len() > MAX_BUNDLE_BYTES {
            return Err(AppError::InvalidInput(
                "This notebook file is too large to import.".into(),
            ));
        }

        let json = std::fs::read_to_string(&src_path)?;
        let bundle: NotebookBundle = serde_json::from_str(&json).map_err(|_| {
            AppError::InvalidInput("This is not a valid NotebookLab notebook file.".into())
        })?;

        if bundle.format != BUNDLE_FORMAT {
            return Err(AppError::InvalidInput(
                "This file is not a NotebookLab notebook.".into(),
            ));
        }
        if bundle.version > BUNDLE_VERSION {
            return Err(AppError::InvalidInput(
                "This notebook was exported by a newer version of NotebookLab.".into(),
            ));
        }

        let state: tauri::State<'_, AppState> = app.state();
        let conn = state.conn()?;
        write_bundle(&conn, bundle)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Import task failed: {e}")))?
}
