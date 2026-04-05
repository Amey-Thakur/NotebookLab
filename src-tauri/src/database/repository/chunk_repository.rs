/*
 * Title: chunk_repository.rs
 * Tech Stack: Rust, rusqlite
 * Description: Data access layer for document chunks. Handles bulk insertion during
 *   ingestion and retrieval for RAG context assembly.
 * Important Details: Chunks are created in batches during document ingestion. The
 *   bulk_create function uses a transaction for atomicity. Chunks are always queried
 *   by document_id (indexed) for document viewer and by position for ordered display.
 */

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::database::models::{Chunk, CreateChunk};
use crate::error::{AppError, AppResult};


/// Insert a batch of chunks within a single transaction.
/// Used by the ingestion pipeline after document parsing and chunking.
pub fn bulk_create(conn: &Connection, chunks: Vec<CreateChunk>) -> AppResult<usize> {
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
        .query_map(params![document_id], |row| {
            Ok(Chunk {
                id: row.get(0)?,
                document_id: row.get(1)?,
                content: row.get(2)?,
                position: row.get(3)?,
                page_number: row.get(4)?,
                heading_context: row.get(5)?,
                token_count: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(chunks)
}


pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Chunk> {
    conn.query_row(
        "SELECT id, document_id, content, position, page_number, heading_context, token_count, created_at
         FROM chunks WHERE id = ?1",
        params![id],
        |row| {
            Ok(Chunk {
                id: row.get(0)?,
                document_id: row.get(1)?,
                content: row.get(2)?,
                position: row.get(3)?,
                page_number: row.get(4)?,
                heading_context: row.get(5)?,
                token_count: row.get(6)?,
                created_at: row.get(7)?,
            })
        },
    )
    .map_err(|_| AppError::NotFound(format!("Chunk not found: {id}")))
}


/// Delete all chunks belonging to a document. Called before re-ingestion.
pub fn delete_by_document(conn: &Connection, document_id: &str) -> AppResult<usize> {
    let affected = conn.execute(
        "DELETE FROM chunks WHERE document_id = ?1",
        params![document_id],
    )?;

    Ok(affected)
}


/// Count total chunks across all documents. Used for status bar display.
pub fn count_all(conn: &Connection) -> AppResult<i64> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM chunks", [], |row| row.get(0))?;
    Ok(count)
}
