/*
 * Title: note.rs
 * Tech Stack: Rust, serde, rusqlite
 * Description: Note domain model. A user-written Markdown document within a notebook.
 * Important Details: Notes support bi-directional linking via [[wiki-link]] syntax.
 *   Link resolution happens at the application layer, not the database layer.
 *   Content is stored as raw Markdown text.
 */

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
