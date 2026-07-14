/*
 * Name: mod.rs
 * Purpose: Database module root.
 * Description: Declares the database sub-modules: models (row types) and
 *   repository (data access). Connection initialization and the migration
 *   runner live in state.rs; embeddings are stored as blobs and compared in
 *   Rust, so there is no vector-search extension to register here.
 * Tech Stack: Rust, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

pub mod models;
pub mod repository;
