/*
 * Name: note_repository.rs
 * Purpose: Data access layer for notes.
 * Description: Handles CRUD, wiki-link extraction, and backlink queries.
 *   [[wiki-links]] are parsed from note content on every save and
 *   mirrored into the links table. Backlinks are resolved by
 *   querying links where the target matches this note's ID; that
 *   powers the editor's backlinks panel. Unresolved link titles
 *   are ignored until a matching note exists.
 * Tech Stack: Rust, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::database::models::{CreateNote, Note, UpdateNote};
use crate::error::{AppError, AppResult};
use crate::utils::text_utils;

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

    sync_note_links(conn, &id, &input.notebook_id, &content)?;
    /* Existing notes may already link to this new title; their [[wiki-link]]
    rows were skipped while it did not exist. Resolve them now so the new
    note's backlinks panel is correct immediately, including the
    click-a-link-to-create-a-note flow. */
    resolve_inbound_links(conn, &input.notebook_id, &id, &title)?;

    get_by_id(conn, &id)
}

pub fn get_by_id(conn: &Connection, id: &str) -> AppResult<Note> {
    conn.query_row(
        "SELECT id, notebook_id, title, content, created_at, updated_at
         FROM notes WHERE id = ?1",
        params![id],
        Note::from_row,
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
        .query_map(params![notebook_id], Note::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notes)
}

pub fn update(conn: &Connection, id: &str, input: UpdateNote) -> AppResult<Note> {
    let existing = get_by_id(conn, id)?;
    let now = chrono::Utc::now().to_rfc3339();

    let old_title = existing.title.clone();
    let notebook_id = existing.notebook_id.clone();
    let title = input.title.unwrap_or(existing.title);
    let content = input.content.unwrap_or(existing.content);

    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
        params![title, content, now, id],
    )?;

    sync_note_links(conn, id, &notebook_id, &content)?;

    /* On rename, inbound backlinks must be re-resolved: notes that already
    [[link]] the new title now resolve to this note, and notes that linked the
    old title must drop their now-stale link rows. */
    if !title.eq_ignore_ascii_case(&old_title) {
        resync_notes_linking_to(conn, &notebook_id, id)?;
        resolve_inbound_links(conn, &notebook_id, id, &title)?;
    }

    get_by_id(conn, id)
}

/// Re-derive the links of every note that currently points at `target_id`, so
/// rows that no longer match (for example after the target was renamed) are
/// dropped and any newly-matching ones are created.
fn resync_notes_linking_to(conn: &Connection, notebook_id: &str, target_id: &str) -> AppResult<()> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT source_id FROM links WHERE target_id = ?1 AND source_type = 'note'",
    )?;
    let source_ids: Vec<String> = stmt
        .query_map(params![target_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    for source_id in source_ids {
        if let Ok(note) = get_by_id(conn, &source_id) {
            sync_note_links(conn, &source_id, notebook_id, &note.content)?;
        }
    }

    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    /* The links table has no foreign key, so removing a note would otherwise
    orphan every link that points at it. Clean both directions first. */
    conn.execute(
        "DELETE FROM links WHERE source_id = ?1 OR target_id = ?1",
        params![id],
    )?;

    let affected = conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;

    if affected == 0 {
        return Err(AppError::NotFound(format!("Note not found: {id}")));
    }

    Ok(())
}

/// Search notes by title within a notebook. Used for [[wiki-link]] autocomplete.
pub fn search_by_title(conn: &Connection, notebook_id: &str, query: &str) -> AppResult<Vec<Note>> {
    let pattern = text_utils::escape_like_pattern(query);

    let mut stmt = conn.prepare(
        "SELECT id, notebook_id, title, content, created_at, updated_at
         FROM notes WHERE notebook_id = ?1 AND title LIKE ?2 ESCAPE '\\'
         ORDER BY updated_at DESC LIMIT 10",
    )?;

    let notes = stmt
        .query_map(params![notebook_id, pattern], Note::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notes)
}

/// Find a note by exact title within a notebook (case-insensitive).
/// Used to resolve a clicked [[wiki-link]] to its target note.
pub fn find_by_title(conn: &Connection, notebook_id: &str, title: &str) -> AppResult<Option<Note>> {
    let mut stmt = conn.prepare(
        "SELECT id, notebook_id, title, content, created_at, updated_at
         FROM notes WHERE notebook_id = ?1 AND title = ?2 COLLATE NOCASE
         ORDER BY updated_at DESC LIMIT 1",
    )?;

    let note = stmt
        .query_map(params![notebook_id, title], Note::from_row)?
        .next()
        .transpose()?;

    Ok(note)
}

/// Extract [[wiki-link]] titles from Markdown content. Pure parsing helper.
/// Nested or empty brackets are skipped; duplicates collapse to one entry.
pub fn extract_wiki_links(content: &str) -> Vec<String> {
    let mut titles: Vec<String> = Vec::new();
    let mut rest = content;

    while let Some(start) = rest.find("[[") {
        let after = &rest[start + 2..];
        match after.find("]]") {
            Some(end) => {
                let title = after[..end].trim();
                if !title.is_empty()
                    && !title.contains("[[")
                    && !titles.iter().any(|t| t.eq_ignore_ascii_case(title))
                {
                    titles.push(title.to_string());
                }
                rest = &after[end + 2..];
            }
            None => break,
        }
    }

    titles
}

/// Re-derive the links table rows for a note from its current content.
/// Titles that do not match an existing note are simply skipped; they start
/// resolving as soon as a note with that title is created.
pub fn sync_note_links(
    conn: &Connection,
    note_id: &str,
    notebook_id: &str,
    content: &str,
) -> AppResult<()> {
    conn.execute(
        "DELETE FROM links WHERE source_id = ?1 AND source_type = 'note'",
        params![note_id],
    )?;

    for title in extract_wiki_links(content) {
        if let Some(target) = find_by_title(conn, notebook_id, &title)? {
            /* A note linking to itself is noise, not a backlink */
            if target.id == note_id {
                continue;
            }
            conn.execute(
                "INSERT INTO links (id, source_id, source_type, target_id, target_type, link_text)
                 VALUES (?1, ?2, 'note', ?3, 'note', ?4)",
                params![Uuid::now_v7().to_string(), note_id, target.id, title],
            )?;
        }
    }

    Ok(())
}

/// Wire up existing notes that already link to a freshly created note's title.
/// Their [[wiki-link]] rows were skipped while the target did not exist, so
/// re-sync each such source now that it resolves. The title match is
/// case-insensitive here; sync_note_links then applies the authoritative
/// lookup, so a non-matching case simply produces no row.
fn resolve_inbound_links(
    conn: &Connection,
    notebook_id: &str,
    new_note_id: &str,
    new_note_title: &str,
) -> AppResult<()> {
    let mut stmt =
        conn.prepare("SELECT id, content FROM notes WHERE notebook_id = ?1 AND id != ?2")?;
    let sources = stmt
        .query_map(params![notebook_id, new_note_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<(String, String)>, _>>()?;
    drop(stmt);

    for (source_id, content) in sources {
        let links_to_new = extract_wiki_links(&content)
            .iter()
            .any(|title| title.eq_ignore_ascii_case(new_note_title));
        if links_to_new {
            sync_note_links(conn, &source_id, notebook_id, &content)?;
        }
    }

    Ok(())
}

/// A recently edited note joined with its notebook name, for the
/// "pick up where you left off" section on the notebooks page.
#[derive(serde::Serialize)]
pub struct RecentNote {
    #[serde(flatten)]
    pub note: Note,
    pub notebook_name: String,
}

/// The most recently edited notes across every notebook.
pub fn list_recent(conn: &Connection, limit: usize) -> AppResult<Vec<RecentNote>> {
    let mut stmt = conn.prepare(
        "SELECT n.id, n.notebook_id, n.title, n.content, n.created_at, n.updated_at, nb.name
         FROM notes n
         INNER JOIN notebooks nb ON n.notebook_id = nb.id
         ORDER BY n.updated_at DESC
         LIMIT ?1",
    )?;

    let notes = stmt
        .query_map(params![limit as i64], |row| {
            Ok(RecentNote {
                note: Note::from_row(row)?,
                notebook_name: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notes)
}

/// One node in the notes connection map: a note and how many links touch it.
#[derive(serde::Serialize)]
pub struct GraphNode {
    pub id: String,
    pub title: String,
    pub degree: i64,
}

/// One directed edge from one note to another via a [[wiki-link]].
#[derive(serde::Serialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
}

/// The connection map for a notebook: nodes and the links between them.
#[derive(serde::Serialize)]
pub struct NotesGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

/// Build the wiki-link connection map for one notebook. Only note-to-note
/// links are included, and both endpoints must live in this notebook.
pub fn notes_graph(conn: &Connection, notebook_id: &str) -> AppResult<NotesGraph> {
    let mut edge_stmt = conn.prepare(
        "SELECT l.source_id, l.target_id
         FROM links l
         INNER JOIN notes s ON l.source_id = s.id
         INNER JOIN notes t ON l.target_id = t.id
         WHERE l.source_type = 'note' AND l.target_type = 'note'
           AND s.notebook_id = ?1 AND t.notebook_id = ?1",
    )?;
    let edges: Vec<GraphEdge> = edge_stmt
        .query_map(params![notebook_id], |row| {
            Ok(GraphEdge {
                source: row.get(0)?,
                target: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    /* Degree counts every link touching a note, incoming or outgoing. Both
    endpoints must still exist in this notebook, matching the edge query
    exactly, so a degree can never exceed the number of drawn lines even if
    an orphaned link survives (for example from a notebook cascade delete). */
    let mut node_stmt = conn.prepare(
        "SELECT n.id, n.title,
            (SELECT COUNT(*) FROM links l
             INNER JOIN notes s ON l.source_id = s.id AND s.notebook_id = ?1
             INNER JOIN notes t ON l.target_id = t.id AND t.notebook_id = ?1
             WHERE (l.source_id = n.id OR l.target_id = n.id)
               AND l.source_type = 'note' AND l.target_type = 'note') AS degree
         FROM notes n
         WHERE n.notebook_id = ?1
         ORDER BY degree DESC, n.updated_at DESC",
    )?;
    let nodes: Vec<GraphNode> = node_stmt
        .query_map(params![notebook_id], |row| {
            Ok(GraphNode {
                id: row.get(0)?,
                title: row.get(1)?,
                degree: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(NotesGraph { nodes, edges })
}

/// List notes that link to the given note (the backlinks panel).
pub fn get_backlinks(conn: &Connection, note_id: &str) -> AppResult<Vec<Note>> {
    let mut stmt = conn.prepare(
        "SELECT n.id, n.notebook_id, n.title, n.content, n.created_at, n.updated_at
         FROM links l
         INNER JOIN notes n ON l.source_id = n.id
         WHERE l.target_id = ?1 AND l.target_type = 'note' AND l.source_type = 'note'
         ORDER BY n.updated_at DESC",
    )?;

    let notes = stmt
        .query_map(params![note_id], Note::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notes)
}

#[cfg(test)]
mod tests {
    use super::extract_wiki_links;

    #[test]
    fn extracts_simple_links() {
        let links = extract_wiki_links("See [[Alpha]] and [[Beta Note]].");
        assert_eq!(links, vec!["Alpha".to_string(), "Beta Note".to_string()]);
    }

    #[test]
    fn skips_empty_and_dedupes_case_insensitively() {
        let links = extract_wiki_links("[[ ]] [[Alpha]] [[alpha]] [[]]");
        assert_eq!(links, vec!["Alpha".to_string()]);
    }

    #[test]
    fn handles_unclosed_brackets() {
        assert!(extract_wiki_links("broken [[link without end").is_empty());
    }

    #[test]
    fn trims_whitespace_inside_brackets() {
        assert_eq!(
            extract_wiki_links("[[  Spaced Title  ]]"),
            vec!["Spaced Title".to_string()]
        );
    }
}
