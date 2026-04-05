/*
 * Title: database/repository/mod.rs
 * Tech Stack: Rust, rusqlite
 * Description: Data access layer declarations. One repository per aggregate root.
 * Important Details: Repositories take a &Connection reference and return domain models.
 *   They contain pure SQL queries with no business logic.
 */
