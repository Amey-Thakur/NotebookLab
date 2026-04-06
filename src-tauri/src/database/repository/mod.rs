/*
 * Title: database/repository/mod.rs
 * Tech Stack: Rust, rusqlite
 * Description: Data access layer declarations. One repository per aggregate root.
 * Important Details: Repositories take a &Connection reference and return domain models.
 *   They contain pure SQL queries with no business logic. All queries use parameterized
 *   statements. Each repository module is independent and removable.
 */

pub mod chunk_repository;
pub mod conversation_repository;
pub mod document_repository;
pub mod note_repository;
pub mod notebook_repository;
