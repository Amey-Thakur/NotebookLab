/*
 * Name: ingestion_service.rs
 * Purpose: Document ingestion pipeline.
 * Description: Orchestrates: parse -> chunk -> store. This is the core value
 *   proposition pipeline. A file enters as a path, and exits as
 *   indexed chunks ready for RAG retrieval. Each step is modular:
 *   parsers handle format extraction, chunking service handles
 *   splitting, and repositories handle persistence. Embedding step
 *   will be added when ONNX is integrated.
 * Tech Stack: Rust, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use std::path::Path;

use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::io::Read;

use crate::database::models::{CreateDocument, DocumentStatus};
use crate::database::repository::{chunk_repository, document_repository};
use crate::error::{AppError, AppResult};
use crate::parsers;
use crate::services::chunking_service;

/// Run the full ingestion pipeline on a file.
/// Returns the created document ID.
pub fn ingest_file(conn: &Connection, notebook_id: &str, file_path: &Path) -> AppResult<String> {
    /* Validate the file exists and get metadata */
    let metadata = std::fs::metadata(file_path)?;

    let extension = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");

    let title = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    /* Compute file hash for deduplication */
    let file_hash = compute_file_hash(file_path)?;

    /* Check if this file was already imported */
    if let Some(existing) = document_repository::find_by_hash(conn, notebook_id, &file_hash)? {
        tracing::info!(
            "Document already imported: {} ({})",
            existing.title,
            existing.id
        );
        return Err(AppError::InvalidInput(format!(
            "This file has already been imported as '{}'",
            existing.title
        )));
    }

    /* Create the document record */
    let doc = document_repository::create(
        conn,
        CreateDocument {
            notebook_id: notebook_id.to_string(),
            title,
            file_path: file_path.to_string_lossy().to_string(),
            file_type: extension.to_string(),
            file_hash,
            file_size: metadata.len() as i64,
        },
    )?;

    tracing::info!("Created document: {} ({})", doc.title, doc.id);

    /* Update status to processing */
    document_repository::update_status(conn, &doc.id, DocumentStatus::Processing)?;

    /* Parse the document */
    let parser = parsers::parser_for_extension(extension)?;
    let parsed = match parser.parse(file_path) {
        Ok(parsed) => parsed,
        Err(e) => {
            document_repository::update_status(conn, &doc.id, DocumentStatus::Error)?;
            return Err(e);
        }
    };

    /* Chunk each page and collect all chunks */
    let mut all_chunks = Vec::new();
    for page in &parsed.pages {
        let heading_context = page.headings.first().cloned().unwrap_or_default();
        let mut page_chunks = chunking_service::chunk_text(
            &doc.id,
            &page.content,
            Some(page.page_number),
            &heading_context,
        );
        all_chunks.append(&mut page_chunks);
    }

    /* Validate at least one chunk was extracted */
    if all_chunks.is_empty() {
        document_repository::update_status(conn, &doc.id, DocumentStatus::Error)?;
        return Err(AppError::InvalidInput(
            "No text content could be extracted from this file".into(),
        ));
    }

    /* Store chunks -- recover to Error status if insertion fails */
    let chunk_count = match chunk_repository::bulk_create(conn, all_chunks) {
        Ok(count) => count,
        Err(e) => {
            document_repository::update_status(conn, &doc.id, DocumentStatus::Error).ok();
            return Err(e);
        }
    };
    tracing::info!("Created {} chunks for document {}", chunk_count, doc.id);

    /* Mark as processed (embedding step will be added later) */
    document_repository::update_status(conn, &doc.id, DocumentStatus::Processed)?;

    Ok(doc.id)
}

/// Compute SHA-256 hash via streaming reads to avoid loading entire file into memory.
fn compute_file_hash(path: &Path) -> AppResult<String> {
    let file = std::fs::File::open(path)?;
    let mut reader = std::io::BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}
