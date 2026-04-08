-- Title: 004_embeddings.sql
-- Description: Embeddings table for vector search. Stores float32 vectors as BLOBs.
-- Important Details: Each chunk gets one embedding. Vectors are stored as raw bytes
--   (384 floats * 4 bytes = 1536 bytes per vector for all-MiniLM-L6-v2, or larger
--   for other models). Cosine similarity is computed in Rust, not SQL.
--   sqlite-vec can replace this with a virtual table when it stabilizes.

CREATE TABLE IF NOT EXISTS embeddings (
    chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
    vector BLOB NOT NULL,
    dimensions INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id);
