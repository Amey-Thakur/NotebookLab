-- Name: 005_canvas.sql
-- Purpose: Canvas workspace table.
-- Description: One free-form spatial canvas per notebook: freehand drawing,
--   shapes, text, and images laid out in one open space. The whole
--   scene is stored as a JSON document in `scene`, so it is portable
--   and travels with the notebook, and images are embedded there so
--   a canvas is fully self-contained. One canvas per notebook is
--   enforced by the unique index; it is created on first open and
--   removed with its notebook through the cascade.
-- License: MIT
-- Authors: Amey Thakur (https://github.com/Amey-Thakur)
--          Archit Konde (https://github.com/Archit-Konde)
-- Date: 2026-07-13

CREATE TABLE IF NOT EXISTS canvases (
    id           TEXT PRIMARY KEY,
    notebook_id  TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    scene        TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_canvases_notebook ON canvases(notebook_id);
