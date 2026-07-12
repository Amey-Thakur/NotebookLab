/*
 * Name: conversation_repository.rs
 * Purpose: Data access layer for chat conversations and messages.
 * Description: Messages are ordered chronologically within a conversation.
 *   Citations link assistant messages to source chunks for RAG
 *   attribution.
 * Tech Stack: Rust, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::database::models::{Citation, Conversation, CreateConversation, Message};
use crate::error::{AppError, AppResult};

pub fn create_conversation(
    conn: &Connection,
    input: CreateConversation,
) -> AppResult<Conversation> {
    let id = Uuid::now_v7().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let title = input.title.unwrap_or_else(|| "New Chat".to_string());

    conn.execute(
        "INSERT INTO conversations (id, notebook_id, title, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, input.notebook_id, title, now, now],
    )?;

    get_conversation(conn, &id)
}

pub fn get_conversation(conn: &Connection, id: &str) -> AppResult<Conversation> {
    conn.query_row(
        "SELECT id, notebook_id, title, created_at, updated_at
         FROM conversations WHERE id = ?1",
        params![id],
        Conversation::from_row,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound(format!("Conversation not found: {id}"))
        }
        other => AppError::Database(other),
    })
}

pub fn list_by_notebook(conn: &Connection, notebook_id: &str) -> AppResult<Vec<Conversation>> {
    let mut stmt = conn.prepare(
        "SELECT id, notebook_id, title, created_at, updated_at
         FROM conversations WHERE notebook_id = ?1 ORDER BY updated_at DESC",
    )?;

    let convos = stmt
        .query_map(params![notebook_id], Conversation::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(convos)
}

pub fn add_message(
    conn: &Connection,
    conversation_id: &str,
    role: &str,
    content: &str,
) -> AppResult<Message> {
    let id = Uuid::now_v7().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, conversation_id, role, content, now],
    )?;

    /* Update conversation's updated_at timestamp */
    conn.execute(
        "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
        params![now, conversation_id],
    )?;

    conn.query_row(
        "SELECT id, conversation_id, role, content, created_at
         FROM messages WHERE id = ?1",
        params![id],
        Message::from_row,
    )
    .map_err(AppError::Database)
}

pub fn get_messages(conn: &Connection, conversation_id: &str) -> AppResult<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, created_at
         FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
    )?;

    let msgs = stmt
        .query_map(params![conversation_id], Message::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(msgs)
}

/// Get the most recent N messages for a conversation (for RAG context window).
/// Returns messages in chronological order (oldest first).
pub fn get_recent_messages(
    conn: &Connection,
    conversation_id: &str,
    limit: usize,
) -> AppResult<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, created_at
         FROM (
             SELECT * FROM messages
             WHERE conversation_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2
         ) ORDER BY created_at ASC",
    )?;

    let msgs = stmt
        .query_map(params![conversation_id, limit as i64], Message::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(msgs)
}

pub fn add_citation(
    conn: &Connection,
    message_id: &str,
    chunk_id: &str,
    relevance_score: f64,
) -> AppResult<()> {
    let id = Uuid::now_v7().to_string();

    conn.execute(
        "INSERT INTO citations (id, message_id, chunk_id, relevance_score)
         VALUES (?1, ?2, ?3, ?4)",
        params![id, message_id, chunk_id, relevance_score],
    )?;

    Ok(())
}

pub fn get_citations_for_message(conn: &Connection, message_id: &str) -> AppResult<Vec<Citation>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.message_id, c.chunk_id, c.relevance_score
         FROM citations c WHERE c.message_id = ?1
         ORDER BY c.relevance_score DESC",
    )?;

    let citations = stmt
        .query_map(params![message_id], |row| {
            Ok(Citation {
                id: row.get(0)?,
                message_id: row.get(1)?,
                chunk_id: row.get(2)?,
                relevance_score: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(citations)
}

/// A citation joined with its chunk and document so the chat UI can render
/// a meaningful source chip (document title, heading, page, snippet).
#[derive(Debug, serde::Serialize)]
pub struct CitationSource {
    pub chunk_id: String,
    pub document_id: String,
    pub document_title: String,
    pub heading_context: String,
    pub page_number: Option<i32>,
    pub snippet: String,
    pub relevance_score: f64,
}

/// Fetch citations for a message with document context for display.
/// The snippet is capped in SQL so large chunks never cross the IPC boundary.
pub fn get_citation_sources(conn: &Connection, message_id: &str) -> AppResult<Vec<CitationSource>> {
    let mut stmt = conn.prepare(
        "SELECT ch.id, d.id, d.title, ch.heading_context, ch.page_number,
                substr(ch.content, 1, 240), c.relevance_score
         FROM citations c
         INNER JOIN chunks ch ON c.chunk_id = ch.id
         INNER JOIN documents d ON ch.document_id = d.id
         WHERE c.message_id = ?1
         ORDER BY c.relevance_score DESC",
    )?;

    let sources = stmt
        .query_map(params![message_id], |row| {
            Ok(CitationSource {
                chunk_id: row.get(0)?,
                document_id: row.get(1)?,
                document_title: row.get(2)?,
                heading_context: row.get(3)?,
                page_number: row.get(4)?,
                snippet: row.get(5)?,
                relevance_score: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(sources)
}

pub fn delete_conversation(conn: &Connection, id: &str) -> AppResult<()> {
    let affected = conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;

    if affected == 0 {
        return Err(AppError::NotFound(format!("Conversation not found: {id}")));
    }

    Ok(())
}
