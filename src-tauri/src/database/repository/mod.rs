/*
 * Name: mod.rs
 * Purpose: Data access layer declarations.
 * Description: One repository per aggregate root. Repositories take a
 *   &Connection reference and return domain models. They contain
 *   pure SQL queries with no business logic. All queries use
 *   parameterized statements. Each repository module is
 *   independent and removable.
 * Tech Stack: Rust, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

pub mod chunk_repository;
pub mod conversation_repository;
pub mod document_repository;
pub mod note_repository;
pub mod notebook_repository;
