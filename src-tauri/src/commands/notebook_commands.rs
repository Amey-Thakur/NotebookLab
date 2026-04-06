/*
 * Title: notebook_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri command handlers for notebook CRUD operations.
 * Important Details: Commands are thin IPC handlers. They acquire the database mutex,
 *   call the repository function, and return the result. All business logic belongs
 *   in the services layer (not yet implemented for notebooks).
 */

use tauri::State;

use crate::database::models::{CreateNotebook, Notebook, UpdateNotebook};
use crate::database::repository::notebook_repository;
use crate::error::AppResult;
use crate::state::AppState;


#[tauri::command]
pub fn list_notebooks(state: State<'_, AppState>) -> AppResult<Vec<Notebook>> {
    let conn = state.db.lock().map_err(|_| crate::error::AppError::Internal("Database lock poisoned".into()))?;
    notebook_repository::list_all(&conn)
}


#[tauri::command]
pub fn get_notebook(state: State<'_, AppState>, id: String) -> AppResult<Notebook> {
    let conn = state.db.lock().map_err(|_| crate::error::AppError::Internal("Database lock poisoned".into()))?;
    notebook_repository::get_by_id(&conn, &id)
}


#[tauri::command]
pub fn create_notebook(state: State<'_, AppState>, input: CreateNotebook) -> AppResult<Notebook> {
    let conn = state.db.lock().map_err(|_| crate::error::AppError::Internal("Database lock poisoned".into()))?;
    notebook_repository::create(&conn, input)
}


#[tauri::command]
pub fn update_notebook(
    state: State<'_, AppState>,
    id: String,
    input: UpdateNotebook,
) -> AppResult<Notebook> {
    let conn = state.db.lock().map_err(|_| crate::error::AppError::Internal("Database lock poisoned".into()))?;
    notebook_repository::update(&conn, &id, input)
}


#[tauri::command]
pub fn delete_notebook(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().map_err(|_| crate::error::AppError::Internal("Database lock poisoned".into()))?;
    notebook_repository::delete(&conn, &id)
}
