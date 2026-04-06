/*
 * Title: note_repository.rs
 * Tech Stack: Rust, rusqlite
 * Description: Data access layer for notes. Handles CRUD and backlink queries.
 * Important Details: Backlinks are resolved by searching the links table for entries
 *   where the target matches this note's ID. This powers the backlinks panel in the editor.
 */

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::database::models::{CreateNote, Note, UpdateNote};
use crate::error::{AppError, AppResult};


pub fn create(conn: &Connection, input: CreateNote) -> AppResult<Note> {
    let id = Uuid::now_v7().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let title = input.title.unwrap_or_else(|| "Untitled".to_string());
    let content = input.content.unwrap_or_default();

    conn.execute(
        "INSERT INTO notes (id, notebook_id, title, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, input.notebook_id, title, content, now, now],
    )?;

    get_by_id(conn, &id)
}


pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Note> {
    conn.query_row(
        "SELECT id, notebook_id, title, content, created_at, updated_at
         FROM notes WHERE id = ?1",
        params![id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Note not found: {id}")),
        other => AppError::Database(other),
    })
}


pub fn list_by_notebook(conn: &Connection, notebook_id: &str) -> AppResult<Vec<Note>> {
    let mut stmt = conn.prepare(
        "SELECT id, notebook_id, title, content, created_at, updated_at
         FROM notes WHERE notebook_id = ?1 ORDER BY updated_at DESC",
    )?;

    let notes = stmt
        .query_map(params![notebook_id], |row| {
            Ok(Note {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notes)
}


pub fn update(conn: &Connection, id: &str, input: UpdateNote) -> AppResult<Note> {
    let existing = get_by_id(conn, id)?;
    let now = chrono::Utc::now().to_rfc3339();

    let title = input.title.unwrap_or(existing.title);
    let content = input.content.unwrap_or(existing.content);

    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
        params![title, content, now, id],
    )?;

    get_by_id(conn, id)
}


pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let affected = conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;

    if affected == 0 {
        return Err(AppError::NotFound(format!("Note not found: {id}")));
    }

    Ok(())
}


/// Search notes by title within a notebook. Used for [[wiki-link]] autocomplete.
pub fn search_by_title(conn: &Connection, notebook_id: &str, query: &str) -> AppResult<Vec<Note>> {
    /* Escape LIKE metacharacters so user input with % or _ searches literally */
    let escaped = query.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    let pattern = format!("%{escaped}%");

    let mut stmt = conn.prepare(
        "SELECT id, notebook_id, title, content, created_at, updated_at
         FROM notes WHERE notebook_id = ?1 AND title LIKE ?2 ESCAPE '\\'
         ORDER BY updated_at DESC LIMIT 10",
    )?;

    let notes = stmt
        .query_map(params![notebook_id, pattern], |row| {
            Ok(Note {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notes)
}
