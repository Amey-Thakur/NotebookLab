/*
 * Title: database/mod.rs
 * Tech Stack: Rust, rusqlite, sqlite-vec
 * Description: Database module. Connection initialization, sqlite-vec extension
 *   registration, migration runner, and sub-module declarations.
 * Important Details: sqlite-vec is registered as an auto-extension so every connection
 *   gets vector search capabilities. Migrations run in order at startup.
 */

pub mod models;
pub mod repository;
