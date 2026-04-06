/*
 * Title: document_repository.rs
 * Tech Stack: Rust, rusqlite
 * Description: Data access layer for documents. Handles CRUD and status transitions.
 * Important Details: Documents are scoped to notebooks via foreign key. The status
 *   field tracks ingestion pipeline progress. Cascade delete removes associated chunks.
 */

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::database::models::{CreateDocument, Document, DocumentStatus};
use crate::error::{AppError, AppResult};


pub fn create(conn: &Connection, input: CreateDocument) -> AppResult<Document> {
    let id = Uuid::now_v7().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO documents (id, notebook_id, title, file_path, file_type, file_hash, file_size, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![id, input.notebook_id, input.title, input.file_path, input.file_type, input.file_hash, input.file_size, DocumentStatus::Pending.as_str(), now, now],
    )?;

    get_by_id(conn, &id)
}


pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Document> {
    conn.query_row(
        "SELECT id, notebook_id, title, file_path, file_type, file_hash, file_size, status, created_at, updated_at
         FROM documents WHERE id = ?1",
        params![id],
        |row| {
            let status_str: String = row.get(7)?;
            Ok(Document {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                file_path: row.get(3)?,
                file_type: row.get(4)?,
                file_hash: row.get(5)?,
                file_size: row.get(6)?,
                status: DocumentStatus::from_str(&status_str),
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Document not found: {id}")),
        other => AppError::Database(other),
    })
}


pub fn list_by_notebook(conn: &Connection, notebook_id: &str) -> AppResult<Vec<Document>> {
    let mut stmt = conn.prepare(
        "SELECT id, notebook_id, title, file_path, file_type, file_hash, file_size, status, created_at, updated_at
         FROM documents WHERE notebook_id = ?1 ORDER BY created_at DESC",
    )?;

    let docs = stmt
        .query_map(params![notebook_id], |row| {
            let status_str: String = row.get(7)?;
            Ok(Document {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                file_path: row.get(3)?,
                file_type: row.get(4)?,
                file_hash: row.get(5)?,
                file_size: row.get(6)?,
                status: DocumentStatus::from_str(&status_str),
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(docs)
}


pub fn update_status(conn: &Connection, id: &str, status: DocumentStatus) -> AppResult<()> {
    let now = chrono::Utc::now().to_rfc3339();

    let affected = conn.execute(
        "UPDATE documents SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status.as_str(), now, id],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound(format!("Document not found: {id}")));
    }

    Ok(())
}


pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let affected = conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;

    if affected == 0 {
        return Err(AppError::NotFound(format!("Document not found: {id}")));
    }

    Ok(())
}


/// Check if a document with the same file hash already exists in a notebook.
pub fn find_by_hash(conn: &Connection, notebook_id: &str, file_hash: &str) -> AppResult<Option<Document>> {
    let result = conn.query_row(
        "SELECT id, notebook_id, title, file_path, file_type, file_hash, file_size, status, created_at, updated_at
         FROM documents WHERE notebook_id = ?1 AND file_hash = ?2",
        params![notebook_id, file_hash],
        |row| {
            let status_str: String = row.get(7)?;
            Ok(Document {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                file_path: row.get(3)?,
                file_type: row.get(4)?,
                file_hash: row.get(5)?,
                file_size: row.get(6)?,
                status: DocumentStatus::from_str(&status_str),
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    );

    match result {
        Ok(doc) => Ok(Some(doc)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}
