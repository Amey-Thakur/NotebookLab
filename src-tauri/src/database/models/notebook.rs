/*
 * Name: notebook.rs
 * Purpose: Notebook domain model.
 * Description: A notebook is the top-level organizer for documents and notes
 *   within a project workspace. UUID v7 primary keys provide
 *   chronological ordering by default. All timestamps are ISO 8601
 *   UTC strings stored in SQLite TEXT columns.
 * Tech Stack: Rust, serde, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use rusqlite::Row;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notebook {
    pub id: String,
    pub name: String,
    pub description: String,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

impl Notebook {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateNotebook {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNotebook {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
}
