/*
 * Title: note_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri command handlers for note CRUD and search operations.
 * Important Details: Notes support wiki-link autocomplete via the search_notes command,
 *   which powers the [[link]] popover in the Milkdown editor.
 */

use tauri::State;

use crate::database::models::{CreateNote, Note, UpdateNote};
use crate::database::repository::note_repository;
use crate::error::AppResult;
use crate::state::AppState;


#[tauri::command]
pub fn list_notes(state: State<'_, AppState>, notebook_id: String) -> AppResult<Vec<Note>> {
    let conn = state.db.lock().unwrap();
    note_repository::list_by_notebook(&conn, &notebook_id)
}


#[tauri::command]
pub fn get_note(state: State<'_, AppState>, id: String) -> AppResult<Note> {
    let conn = state.db.lock().unwrap();
    note_repository::get_by_id(&conn, &id)
}


#[tauri::command]
pub fn create_note(state: State<'_, AppState>, input: CreateNote) -> AppResult<Note> {
    let conn = state.db.lock().unwrap();
    note_repository::create(&conn, input)
}


#[tauri::command]
pub fn update_note(state: State<'_, AppState>, id: String, input: UpdateNote) -> AppResult<Note> {
    let conn = state.db.lock().unwrap();
    note_repository::update(&conn, &id, input)
}


#[tauri::command]
pub fn delete_note(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    note_repository::delete(&conn, &id)
}


#[tauri::command]
pub fn search_notes(
    state: State<'_, AppState>,
    notebook_id: String,
    query: String,
) -> AppResult<Vec<Note>> {
    let conn = state.db.lock().unwrap();
    note_repository::search_by_title(&conn, &notebook_id, &query)
}
