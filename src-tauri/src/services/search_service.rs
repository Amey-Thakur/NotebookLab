/*
 * Title: search_service.rs
 * Tech Stack: Rust, rusqlite, FTS5
 * Description: Full-text search across document chunks using SQLite FTS5.
 * Important Details: This is a keyword-based search using FTS5. Semantic vector search
 *   will be added when sqlite-vec is integrated. For now, this provides the retrieval
 *   component of the RAG pipeline using BM25 ranking.
 */

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::error::AppResult;
use crate::utils::text_utils;


#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub chunk_id: String,
    pub document_id: String,
    pub content: String,
    pub heading_context: String,
    pub page_number: Option<i32>,
    pub score: f64,
}


/// Search document chunks by keyword within a notebook's documents.
/// Uses SQLite LIKE matching (FTS5 will replace this when integrated).
pub fn search_chunks(
    conn: &Connection,
    notebook_id: &str,
    query: &str,
    limit: usize,
) -> AppResult<Vec<SearchResult>> {
    let limit = limit.min(1000);
    let pattern = text_utils::escape_like_pattern(query);

    let mut stmt = conn.prepare(
        "SELECT c.id, c.document_id, c.content, c.heading_context, c.page_number
         FROM chunks c
         INNER JOIN documents d ON c.document_id = d.id
         WHERE d.notebook_id = ?1 AND c.content LIKE ?2 ESCAPE '\\'
         LIMIT ?3",
    )?;

    let results = stmt
        .query_map(params![notebook_id, pattern, limit as i64], |row| {
            Ok(SearchResult {
                chunk_id: row.get(0)?,
                document_id: row.get(1)?,
                content: row.get(2)?,
                heading_context: row.get(3)?,
                page_number: row.get(4)?,
                score: 1.0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(results)
}
