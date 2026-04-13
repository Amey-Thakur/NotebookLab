/*
 * Title: search_service.rs
 * Tech Stack: Rust, rusqlite, FTS5
 * Description: Full-text search across document chunks using SQLite FTS5.
 * Important Details: Uses FTS5 with BM25 ranking for relevance scoring. Falls back
 *   to LIKE-based search if the FTS5 table does not exist (first run before migration).
 *   Semantic vector search will be added when sqlite-vec is integrated.
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
/// Uses FTS5 with BM25 ranking. Falls back to LIKE if FTS5 is unavailable.
pub fn search_chunks(
    conn: &Connection,
    notebook_id: &str,
    query: &str,
    limit: usize,
) -> AppResult<Vec<SearchResult>> {
    let limit = limit.min(1000);

    /* Try FTS5 first for ranked results */
    match search_fts5(conn, notebook_id, query, limit) {
        Ok(results) if !results.is_empty() => return Ok(results),
        Ok(_) => {} /* Empty results, fall through to LIKE */
        Err(_) => {} /* FTS5 table might not exist yet */
    }

    /* Fallback: LIKE-based search (slower but always works) */
    search_like(conn, notebook_id, query, limit)
}


/// FTS5-based search with BM25 relevance ranking.
/// Query is sanitized to prevent FTS5 syntax injection (AND, OR, NEAR, etc).
fn search_fts5(
    conn: &Connection,
    notebook_id: &str,
    query: &str,
    limit: usize,
) -> AppResult<Vec<SearchResult>> {
    /* Sanitize: quote each word to force literal matching, strip FTS5 operators */
    let safe_query = sanitize_fts5_query(query);
    if safe_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT c.id, c.document_id, c.content, c.heading_context, c.page_number,
                bm25(chunks_fts) as rank
         FROM chunks_fts
         INNER JOIN chunks c ON chunks_fts.rowid = c.rowid
         INNER JOIN documents d ON c.document_id = d.id
         WHERE chunks_fts MATCH ?1 AND d.notebook_id = ?2
         ORDER BY rank
         LIMIT ?3",
    )?;

    let results = stmt
        .query_map(params![safe_query, notebook_id, limit as i64], |row| {
            Ok(SearchResult {
                chunk_id: row.get(0)?,
                document_id: row.get(1)?,
                content: row.get(2)?,
                heading_context: row.get(3)?,
                page_number: row.get(4)?,
                score: row.get::<_, f64>(5)?.abs(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(results)
}


/// Sanitize a user query for safe use with FTS5 MATCH.
/// Wraps each word in double quotes to force literal matching, preventing
/// injection of FTS5 operators (AND, OR, NOT, NEAR, *, ^, etc).
fn sanitize_fts5_query(query: &str) -> String {
    query
        .split_whitespace()
        .map(|word| {
            /* Strip quotes and FTS5 special chars, then wrap in quotes */
            let clean: String = word.chars()
                .filter(|c| !matches!(c, '"' | '*' | '^' | '{' | '}' | '(' | ')'))
                .collect();
            if clean.is_empty() { String::new() } else { format!("\"{clean}\"") }
        })
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}


/// LIKE-based fallback search (no ranking, full table scan).
fn search_like(
    conn: &Connection,
    notebook_id: &str,
    query: &str,
    limit: usize,
) -> AppResult<Vec<SearchResult>> {
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
