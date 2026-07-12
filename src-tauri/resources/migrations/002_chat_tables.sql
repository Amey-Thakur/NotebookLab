-- Name: 002_chat_tables.sql
-- Purpose: Chat conversation and message tables for RAG-powered AI chat.
-- Description: Messages store role (user/assistant) and content. Citations
--   link AI responses back to specific chunks for source
--   attribution.
-- Tech Stack: SQLite
-- License: MIT
-- Authors: Amey Thakur (https://github.com/Amey-Thakur)
--          Archit Konde (https://github.com/Archit-Konde)
-- Date: 2026-07-12

CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    notebook_id     TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT 'New Chat',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS citations (
    id              TEXT PRIMARY KEY,
    message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    chunk_id        TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
    relevance_score REAL NOT NULL DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS idx_conversations_notebook ON conversations(notebook_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_citations_message ON citations(message_id);
