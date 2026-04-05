/*
 * Title: notebook_repository.rs
 * Tech Stack: Rust, rusqlite
 * Description: Data access layer for notebooks. Pure SQL queries, no business logic.
 * Important Details: All queries use parameterized statements to prevent SQL injection.
 *   UUID v7 IDs are generated at the application layer, not the database.
 *   Timestamps use ISO 8601 UTC format with 'Z' suffix for unambiguous parsing.
 */

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::database::models::{CreateNotebook, Notebook, UpdateNotebook};
use crate::error::{AppError, AppResult};


pub fn create(conn: &Connection, input: CreateNotebook) -> AppResult<Notebook> {
    let id = Uuid::now_v7().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let description = input.description.unwrap_or_default();
    let color = input.color.unwrap_or_else(|| "#4A70A9".to_string());

    conn.execute(
        "INSERT INTO notebooks (id, name, description, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, input.name, description, color, now, now],
    )?;

    get_by_id(conn, &id)
}


pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Notebook> {
    conn.query_row(
        "SELECT id, name, description, color, created_at, updated_at
         FROM notebooks WHERE id = ?1",
        params![id],
        |row| {
            Ok(Notebook {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
    .map_err(|_| AppError::NotFound(format!("Notebook not found: {id}")))
}


pub fn list_all(conn: &Connection) -> AppResult<Vec<Notebook>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, color, created_at, updated_at
         FROM notebooks ORDER BY created_at DESC",
    )?;

    let notebooks = stmt
        .query_map([], |row| {
            Ok(Notebook {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notebooks)
}


pub fn update(conn: &Connection, id: &str, input: UpdateNotebook) -> AppResult<Notebook> {
    let existing = get_by_id(conn, id)?;
    let now = chrono::Utc::now().to_rfc3339();

    let name = input.name.unwrap_or(existing.name);
    let description = input.description.unwrap_or(existing.description);
    let color = input.color.unwrap_or(existing.color);

    conn.execute(
        "UPDATE notebooks SET name = ?1, description = ?2, color = ?3, updated_at = ?4
         WHERE id = ?5",
        params![name, description, color, now, id],
    )?;

    get_by_id(conn, id)
}


pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let affected = conn.execute("DELETE FROM notebooks WHERE id = ?1", params![id])?;

    if affected == 0 {
        return Err(AppError::NotFound(format!("Notebook not found: {id}")));
    }

    Ok(())
}
