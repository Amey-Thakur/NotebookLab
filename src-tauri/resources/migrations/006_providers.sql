-- Migration 006: persisted AI provider configurations.
--
-- Registered providers (cloud API keys, Ollama model choices, custom
-- endpoints) previously lived only in memory and vanished on restart, forcing
-- users to re-enter API keys every launch. Name is the primary key because the
-- router replaces providers by name. The API key is stored in the local
-- database, which lives in the user's own app-data directory alongside their
-- notes; it is never returned to the frontend after saving and is only ever
-- sent to the provider it belongs to.

CREATE TABLE IF NOT EXISTS providers (
    name            TEXT PRIMARY KEY,
    kind            TEXT NOT NULL,
    base_url        TEXT NOT NULL,
    api_key         TEXT,
    model           TEXT NOT NULL,
    is_local        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
