/*
 * Title: notebook.rs
 * Tech Stack: Rust, serde, rusqlite
 * Description: Notebook domain model. A notebook is the top-level organizer for
 *   documents and notes within a project workspace.
 * Important Details: UUID v7 primary keys provide chronological ordering by default.
 *   All timestamps are ISO 8601 UTC strings stored in SQLite TEXT columns.
 */

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
