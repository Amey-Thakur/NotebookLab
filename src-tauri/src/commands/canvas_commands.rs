/*
 * Name: canvas_commands.rs
 * Purpose: Tauri commands for the notebook canvas.
 * Description: Two small, synchronous commands: open (get or create) a
 *   notebook's canvas, and save its scene. Saving is capped so
 *   embedded images cannot grow the database without bound. The
 *   scene is opaque JSON owned by the frontend.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

use tauri::State;

use crate::database::models::Canvas;
use crate::database::repository::canvas_repository;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Cap the stored scene so embedded images cannot grow the database without
/// bound. Generous, but a real ceiling.
const MAX_SCENE_BYTES: usize = 48 * 1024 * 1024;

#[tauri::command(rename_all = "snake_case")]
pub fn get_or_create_canvas(state: State<'_, AppState>, notebook_id: String) -> AppResult<Canvas> {
    let conn = state.conn()?;
    canvas_repository::get_or_create(&conn, &notebook_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_canvas(state: State<'_, AppState>, id: String, scene: String) -> AppResult<Canvas> {
    if scene.len() > MAX_SCENE_BYTES {
        return Err(AppError::InvalidInput(
            "This canvas is too large to save. Try using fewer or smaller images.".into(),
        ));
    }

    let conn = state.conn()?;
    canvas_repository::update_scene(&conn, &id, &scene)
}
