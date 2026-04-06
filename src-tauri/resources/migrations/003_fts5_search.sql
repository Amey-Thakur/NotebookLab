-- Title: 003_fts5_search.sql
-- Tech Stack: SQLite FTS5
-- Description: Full-text search index on document chunks for fast keyword search.
-- Important Details: FTS5 virtual table mirrors chunk content. Populated via triggers
--   that fire on chunk INSERT and DELETE. BM25 ranking provides relevance scoring.

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    content,
    heading_context,
    content='chunks',
    content_rowid='rowid'
);

-- Populate FTS from existing chunks (safe to re-run)
INSERT OR IGNORE INTO chunks_fts(rowid, content, heading_context)
    SELECT rowid, content, heading_context FROM chunks;

-- Auto-sync FTS on chunk insert
CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, content, heading_context)
    VALUES (new.rowid, new.content, new.heading_context);
END;

-- Auto-sync FTS on chunk delete
CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, content, heading_context)
    VALUES ('delete', old.rowid, old.content, old.heading_context);
END;
