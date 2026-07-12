/*
 * Name: chunk.rs
 * Purpose: Chunk domain model.
 * Description: A text segment extracted from a document during the ingestion
 *   pipeline, ready for embedding and RAG retrieval. Chunks are
 *   created by the chunking service with ~300-500 token windows
 *   and 50-token overlap. Each chunk carries positional metadata
 *   (page number, heading context) for citation reconstruction.
 * Tech Stack: Rust, serde, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use rusqlite::Row;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: String,
    pub document_id: String,
    pub content: String,
    pub position: i32,
    pub page_number: Option<i32>,
    pub heading_context: String,
    pub token_count: i32,
    pub created_at: String,
}

impl Chunk {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            document_id: row.get(1)?,
            content: row.get(2)?,
            position: row.get(3)?,
            page_number: row.get(4)?,
            heading_context: row.get(5)?,
            token_count: row.get(6)?,
            created_at: row.get(7)?,
        })
    }
}

#[derive(Debug)]
pub struct CreateChunk {
    pub document_id: String,
    pub content: String,
    pub position: i32,
    pub page_number: Option<i32>,
    pub heading_context: String,
    pub token_count: i32,
}
