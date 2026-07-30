/*
 * Name: canvas_repository.rs
 * Purpose: Data access layer for notebook canvases.
 * Description: One canvas per notebook. The scene is stored as an opaque JSON
 *   string; the repository never inspects it. The canvas is created
 *   lazily the first time it is opened, so a notebook without a
 *   canvas costs nothing until the user draws.
 * Tech Stack: Rust, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::database::models::Canvas;
use crate::error::{AppError, AppResult};

/// Get the notebook's canvas, creating an empty one on first access.
pub fn get_or_create(conn: &Connection, notebook_id: &str) -> AppResult<Canvas> {
    if let Some(canvas) = find_by_notebook(conn, notebook_id)? {
        return Ok(canvas);
    }

    let id = Uuid::now_v7().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO canvases (id, notebook_id, scene, created_at, updated_at)
         VALUES (?1, ?2, '', ?3, ?3)",
        params![id, notebook_id, now],
    )?;

    get_by_id(conn, &id)
}

pub fn find_by_notebook(conn: &Connection, notebook_id: &str) -> AppResult<Option<Canvas>> {
    let mut stmt = conn.prepare(
        "SELECT id, notebook_id, scene, created_at, updated_at
         FROM canvases WHERE notebook_id = ?1",
    )?;

    let canvas = stmt
        .query_map(params![notebook_id], Canvas::from_row)?
        .next()
        .transpose()?;

    Ok(canvas)
}

pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Canvas> {
    conn.query_row(
        "SELECT id, notebook_id, scene, created_at, updated_at FROM canvases WHERE id = ?1",
        params![id],
        Canvas::from_row,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("Canvas not found: {id}"))
        }
        other => AppError::Database(other),
    })
}

/// Cap the stored scene so embedded images cannot grow the database without
/// bound. Generous, but a real ceiling.
///
/// This lives here rather than in the command because the command was the only
/// thing enforcing it, and importing a shared notebook writes a scene through
/// `update_scene` directly. A bundle could therefore carry a scene of any size up
/// to the whole bundle limit and write it straight into the database, walking
/// past the guard that exists to prevent exactly that. A limit that one caller
/// can route around is not a limit.
pub const MAX_SCENE_BYTES: usize = 48 * 1024 * 1024;

/// Replace the stored scene JSON.
pub fn update_scene(conn: &Connection, id: &str, scene: &str) -> AppResult<Canvas> {
    if scene.len() > MAX_SCENE_BYTES {
        return Err(AppError::InvalidInput(
            "This canvas is too large to save. Try using fewer or smaller images.".into(),
        ));
    }

    let now = chrono::Utc::now().to_rfc3339();
    let affected = conn.execute(
        "UPDATE canvases SET scene = ?1, updated_at = ?2 WHERE id = ?3",
        params![scene, now, id],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound(format!("Canvas not found: {id}")));
    }

    get_by_id(conn, id)
}
