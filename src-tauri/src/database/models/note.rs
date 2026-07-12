/*
 * Title: note.rs
 * Tech Stack: Rust, serde, rusqlite
 * Description: Note domain model. A user-written Markdown document within a notebook.
 * Important Details: Notes support bi-directional linking via [[wiki-link]] syntax.
 *   Link resolution happens at the application layer, not the database layer.
 *   Content is stored as raw Markdown text.
 */

use rusqlite::Row;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub notebook_id: String,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

impl Note {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            notebook_id: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateNote {
    pub notebook_id: String,
    pub title: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNote {
    pub title: Option<String>,
    pub content: Option<String>,
}
