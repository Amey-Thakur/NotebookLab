/*
 * Name: chunk_repository.rs
 * Purpose: Data access layer for document chunks.
 * Description: Handles bulk insertion during ingestion and retrieval for RAG
 *   context assembly. Chunks are created in batches during
 *   document ingestion. The bulk_create function uses a
 *   transaction for atomicity. Chunks are always queried by
 *   document_id (indexed) for document viewer and by position for
 *   ordered display.
 * Tech Stack: Rust, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::database::models::{Chunk, CreateChunk};
use crate::error::AppResult;

/// Insert a batch of chunks within a single transaction.
/// Used by the ingestion pipeline after document parsing and chunking.
pub fn bulk_create(conn: &Connection, chunks: Vec<CreateChunk>) -> AppResult<usize> {
    /* Safety: unchecked_transaction is required because conn is &Connection (not &mut),
    held behind a Mutex. The Mutex guarantees single-thread access, preventing
    concurrent transactions on the same connection. */
    let tx = conn.unchecked_transaction()?;
    let now = chrono::Utc::now().to_rfc3339();
    let count = chunks.len();

    for chunk in chunks {
        let id = Uuid::now_v7().to_string();

        tx.execute(
            "INSERT INTO chunks (id, document_id, content, position, page_number, heading_context, token_count, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, chunk.document_id, chunk.content, chunk.position, chunk.page_number, chunk.heading_context, chunk.token_count, now],
        )?;
    }

    tx.commit()?;
    Ok(count)
}

pub fn get_by_document(conn: &Connection, document_id: &str) -> AppResult<Vec<Chunk>> {
    let mut stmt = conn.prepare(
        "SELECT id, document_id, content, position, page_number, heading_context, token_count, created_at
         FROM chunks WHERE document_id = ?1 ORDER BY position ASC",
    )?;

    let chunks = stmt
        .query_map(params![document_id], Chunk::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(chunks)
}

/// Count total chunks across all documents. Used for status bar display.
pub fn count_all(conn: &Connection) -> AppResult<i64> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM chunks", [], |row| row.get(0))?;
    Ok(count)
}

/// A representative spread of chunk text across a whole notebook, used by the
/// Studio when no specific focus is given so generation covers all sources.
pub fn sample_for_notebook(
    conn: &Connection,
    notebook_id: &str,
    limit: usize,
) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT c.content
         FROM chunks c
         INNER JOIN documents d ON c.document_id = d.id
         WHERE d.notebook_id = ?1
         ORDER BY d.created_at DESC, c.position ASC
         LIMIT ?2",
    )?;

    let rows = stmt
        .query_map(params![notebook_id, limit as i64], |row| {
            row.get::<_, String>(0)
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}
