/*
 * Name: note_commands.rs
 * Purpose: Tauri command handlers for note CRUD, wiki-link resolution,
 *   backlink queries, and Markdown export.
 * Description: resolve_wiki_link finds a note by exact title or creates it,
 *   so clicking a [[link]] in the editor always lands somewhere
 *   useful. get_backlinks powers the backlinks panel under the
 *   editor. export_note writes a note to a user-chosen path.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use tauri::State;

use crate::database::models::{CreateNote, Note, UpdateNote};
use crate::database::repository::note_repository;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command(rename_all = "snake_case")]
pub fn list_notes(state: State<'_, AppState>, notebook_id: String) -> AppResult<Vec<Note>> {
    let conn = state.conn()?;
    note_repository::list_by_notebook(&conn, &notebook_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_note(state: State<'_, AppState>, id: String) -> AppResult<Note> {
    let conn = state.conn()?;
    note_repository::get_by_id(&conn, &id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_note(state: State<'_, AppState>, input: CreateNote) -> AppResult<Note> {
    let conn = state.conn()?;
    note_repository::create(&conn, input)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_note(state: State<'_, AppState>, id: String, input: UpdateNote) -> AppResult<Note> {
    let conn = state.conn()?;
    note_repository::update(&conn, &id, input)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_note(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    note_repository::delete(&conn, &id)
}

/// List notes that link to this note via [[wiki-links]].
#[tauri::command(rename_all = "snake_case")]
pub fn get_backlinks(state: State<'_, AppState>, note_id: String) -> AppResult<Vec<Note>> {
    let conn = state.conn()?;
    note_repository::get_backlinks(&conn, &note_id)
}

/// Resolve a [[wiki-link]] title to a note, creating the note when it does
/// not exist yet. Clicking a link therefore always navigates somewhere.
#[tauri::command(rename_all = "snake_case")]
pub fn resolve_wiki_link(
    state: State<'_, AppState>,
    notebook_id: String,
    title: String,
) -> AppResult<Note> {
    let trimmed = title.trim();
    if trimmed.is_empty() || trimmed.len() > 300 {
        return Err(AppError::InvalidInput(
            "Link title must be 1-300 characters".into(),
        ));
    }

    let conn = state.conn()?;
    if let Some(existing) = note_repository::find_by_title(&conn, &notebook_id, trimmed)? {
        return Ok(existing);
    }

    note_repository::create(
        &conn,
        CreateNote {
            notebook_id,
            title: Some(trimmed.to_string()),
            content: None,
        },
    )
}

/// Write a note's Markdown to a path the user picked in the save dialog.
/// The dialog owns overwrite confirmation, so this write is unconditional.
#[tauri::command(rename_all = "snake_case")]
pub fn export_note(state: State<'_, AppState>, id: String, file_path: String) -> AppResult<()> {
    if file_path.trim().is_empty() {
        return Err(AppError::InvalidInput("Export path is required".into()));
    }

    let note = {
        let conn = state.conn()?;
        note_repository::get_by_id(&conn, &id)?
    };

    std::fs::write(&file_path, note.content)?;
    tracing::info!("Exported note {id} to {file_path}");
    Ok(())
}
