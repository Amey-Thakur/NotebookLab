/*
 * Name: notebook_commands.rs
 * Purpose: Tauri command handlers for notebook CRUD operations.
 * Description: Commands are thin IPC handlers. They acquire the database
 *   mutex, call the repository function, and return the result.
 *   All business logic belongs in the services layer (not yet
 *   implemented for notebooks).
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use tauri::State;

use crate::database::models::{CreateNotebook, Notebook, UpdateNotebook};
use crate::database::repository::notebook_repository;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command(rename_all = "snake_case")]
pub fn list_notebooks(state: State<'_, AppState>) -> AppResult<Vec<Notebook>> {
    let conn = state.conn()?;
    notebook_repository::list_all(&conn)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_notebook(state: State<'_, AppState>, id: String) -> AppResult<Notebook> {
    let conn = state.conn()?;
    notebook_repository::get_by_id(&conn, &id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_notebook(state: State<'_, AppState>, input: CreateNotebook) -> AppResult<Notebook> {
    let conn = state.conn()?;
    notebook_repository::create(&conn, input)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_notebook(
    state: State<'_, AppState>,
    id: String,
    input: UpdateNotebook,
) -> AppResult<Notebook> {
    let conn = state.conn()?;
    notebook_repository::update(&conn, &id, input)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_notebook(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    notebook_repository::delete(&conn, &id)
}
