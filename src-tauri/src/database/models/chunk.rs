/*
 * Title: chunk.rs
 * Tech Stack: Rust, serde, rusqlite
 * Description: Chunk domain model. A text segment extracted from a document during
 *   the ingestion pipeline, ready for embedding and RAG retrieval.
 * Important Details: Chunks are created by the chunking service with ~300-500 token
 *   windows and 50-token overlap. Each chunk carries positional metadata (page number,
 *   heading context) for citation reconstruction.
 */

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


#[derive(Debug)]
pub struct CreateChunk {
    pub document_id: String,
    pub content: String,
    pub position: i32,
    pub page_number: Option<i32>,
    pub heading_context: String,
    pub token_count: i32,
}
