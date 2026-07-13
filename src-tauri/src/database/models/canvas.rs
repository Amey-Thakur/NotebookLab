/*
 * Name: canvas.rs
 * Purpose: Canvas domain model.
 * Description: A notebook's free-form spatial canvas. The entire scene, its
 *   drawings, shapes, text, and embedded images, is stored as a JSON
 *   document in `scene`; the backend treats it as opaque text and the
 *   frontend owns its shape. One canvas exists per notebook.
 * Tech Stack: Rust, serde, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

use rusqlite::Row;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Canvas {
    pub id: String,
    pub notebook_id: String,
    pub scene: String,
    pub created_at: String,
    pub updated_at: String,
}

impl Canvas {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            notebook_id: row.get(1)?,
            scene: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    }
}
