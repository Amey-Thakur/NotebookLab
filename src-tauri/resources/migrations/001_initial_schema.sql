-- Title: 001_initial_schema.sql
-- Tech Stack: SQLite
-- Description: Initial database schema for notebooks, documents, notes, chunks, links, tags.
-- Important Details: UUID7 primary keys for chronological ordering. WAL mode assumed.

CREATE TABLE IF NOT EXISTS notebooks (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT DEFAULT '',
    color           TEXT DEFAULT '#4A70A9',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
    id              TEXT PRIMARY KEY,
    notebook_id     TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    file_type       TEXT NOT NULL,
    file_hash       TEXT NOT NULL,
    file_size       INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
    id              TEXT PRIMARY KEY,
    notebook_id     TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT 'Untitled',
    content         TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chunks (
    id              TEXT PRIMARY KEY,
    document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    position        INTEGER NOT NULL,
    page_number     INTEGER,
    heading_context TEXT DEFAULT '',
    token_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS links (
    id              TEXT PRIMARY KEY,
    source_id       TEXT NOT NULL,
    source_type     TEXT NOT NULL,
    target_id       TEXT NOT NULL,
    target_type     TEXT NOT NULL,
    link_text       TEXT DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tag_associations (
    tag_id          TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    entity_id       TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    PRIMARY KEY (tag_id, entity_id, entity_type)
);

CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);

-- Indexes for join performance
CREATE INDEX IF NOT EXISTS idx_documents_notebook ON documents(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notes_notebook ON notes(notebook_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id, target_type);
CREATE INDEX IF NOT EXISTS idx_tag_assoc_entity ON tag_associations(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(file_hash);
