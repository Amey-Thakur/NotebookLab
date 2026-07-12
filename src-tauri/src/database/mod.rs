/*
 * Name: mod.rs
 * Purpose: Database module.
 * Description: Connection initialization, sqlite-vec extension registration,
 *   migration runner, and sub-module declarations. sqlite-vec is
 *   registered as an auto-extension so every connection gets
 *   vector search capabilities. Migrations run in order at
 *   startup.
 * Tech Stack: Rust, rusqlite, sqlite-vec
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

pub mod models;
pub mod repository;
