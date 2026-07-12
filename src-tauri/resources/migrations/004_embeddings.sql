-- Name: 004_embeddings.sql
-- Purpose: Embeddings table for vector search.
-- Description: Stores float32 vectors as BLOBs. Each chunk gets one
--   embedding. Vectors are stored as raw bytes (384 floats * 4
--   bytes = 1536 bytes per vector for all-MiniLM-L6-v2, or larger
--   for other models). Cosine similarity is computed in Rust, not
--   SQL. sqlite-vec can replace this with a virtual table when it
--   stabilizes.
-- License: MIT
-- Authors: Amey Thakur (https://github.com/Amey-Thakur)
--          Archit Konde (https://github.com/Archit-Konde)
-- Date: 2026-07-12

CREATE TABLE IF NOT EXISTS embeddings (
    chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
    vector BLOB NOT NULL,
    dimensions INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id);
