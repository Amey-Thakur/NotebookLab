/*
 * Name: search_service.rs
 * Purpose: Search across document chunks.
 * Description: Combines FTS5 keyword ranking with vector similarity when
 *   embeddings are available (hybrid search). FTS5 with BM25
 *   handles keyword relevance; the embedding service supplies
 *   cosine-similarity hits. The two lists are merged with
 *   reciprocal rank fusion so neither signal dominates. Falls back
 *   to LIKE-based search if the FTS5 table does not exist yet.
 * Tech Stack: Rust, rusqlite, FTS5
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::error::AppResult;
use crate::services::embedding_service;
use crate::utils::text_utils;

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub chunk_id: String,
    pub document_id: String,
    pub document_title: String,
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
        Ok(_) => {}  /* Empty results, fall through to LIKE */
        Err(_) => {} /* FTS5 table might not exist yet */
    }

    /* Fallback: LIKE-based search (slower but always works) */
    search_like(conn, notebook_id, query, limit)
}

/// Hybrid search: merge keyword hits with vector-similarity hits when a query
/// embedding is available. Uses reciprocal rank fusion (k=60) so a chunk that
/// ranks well on either signal surfaces, and one that ranks on both wins.
pub fn search_chunks_hybrid(
    conn: &Connection,
    notebook_id: &str,
    query: &str,
    query_vector: Option<&[f32]>,
    limit: usize,
) -> AppResult<Vec<SearchResult>> {
    let keyword_hits = search_chunks(conn, notebook_id, query, limit)?;

    let Some(vector) = query_vector else {
        return Ok(keyword_hits);
    };

    let vector_hits =
        embedding_service::search_similar(conn, vector, notebook_id, limit).unwrap_or_default();
    if vector_hits.is_empty() {
        return Ok(keyword_hits);
    }

    /* Reciprocal rank fusion over the two ranked lists */
    const RRF_K: f64 = 60.0;
    let mut fused: std::collections::HashMap<String, f64> = std::collections::HashMap::new();

    for (rank, hit) in keyword_hits.iter().enumerate() {
        *fused.entry(hit.chunk_id.clone()).or_insert(0.0) += 1.0 / (RRF_K + rank as f64 + 1.0);
    }
    for (rank, (chunk_id, _score)) in vector_hits.iter().enumerate() {
        *fused.entry(chunk_id.clone()).or_insert(0.0) += 1.0 / (RRF_K + rank as f64 + 1.0);
    }

    /* Load metadata for vector-only hits that keyword search did not return */
    let mut by_id: std::collections::HashMap<String, SearchResult> = keyword_hits
        .into_iter()
        .map(|r| (r.chunk_id.clone(), r))
        .collect();

    for (chunk_id, _) in &vector_hits {
        if !by_id.contains_key(chunk_id) {
            if let Some(result) = load_chunk_result(conn, chunk_id)? {
                by_id.insert(chunk_id.clone(), result);
            }
        }
    }

    let mut merged: Vec<SearchResult> = fused
        .into_iter()
        .filter_map(|(chunk_id, score)| {
            by_id.remove(&chunk_id).map(|mut r| {
                r.score = score;
                r
            })
        })
        .collect();

    merged.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    merged.truncate(limit);
    Ok(merged)
}

/// Load a single chunk as a SearchResult (used for vector-only hits).
fn load_chunk_result(conn: &Connection, chunk_id: &str) -> AppResult<Option<SearchResult>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.document_id, d.title, c.content, c.heading_context, c.page_number
         FROM chunks c
         INNER JOIN documents d ON c.document_id = d.id
         WHERE c.id = ?1",
    )?;

    let result = stmt
        .query_map(params![chunk_id], |row| {
            Ok(SearchResult {
                chunk_id: row.get(0)?,
                document_id: row.get(1)?,
                document_title: row.get(2)?,
                content: row.get(3)?,
                heading_context: row.get(4)?,
                page_number: row.get(5)?,
                score: 0.0,
            })
        })?
        .next()
        .transpose()?;

    Ok(result)
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
        "SELECT c.id, c.document_id, d.title, c.content, c.heading_context, c.page_number,
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
                document_title: row.get(2)?,
                content: row.get(3)?,
                heading_context: row.get(4)?,
                page_number: row.get(5)?,
                score: row.get::<_, f64>(6)?.abs(),
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
            let clean: String = word
                .chars()
                .filter(|c| !matches!(c, '"' | '*' | '^' | '{' | '}' | '(' | ')'))
                .collect();
            if clean.is_empty() {
                String::new()
            } else {
                format!("\"{clean}\"")
            }
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
        "SELECT c.id, c.document_id, d.title, c.content, c.heading_context, c.page_number
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
                document_title: row.get(2)?,
                content: row.get(3)?,
                heading_context: row.get(4)?,
                page_number: row.get(5)?,
                score: 1.0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(results)
}
