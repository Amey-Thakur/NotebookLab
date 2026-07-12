/*
 * Title: conversation.rs
 * Tech Stack: Rust, serde, rusqlite
 * Description: Conversation and message models for RAG-powered AI chat.
 * Important Details: Each conversation is scoped to a notebook. Messages alternate
 *   between user and assistant roles. Citations link assistant messages to source chunks.
 */

use rusqlite::Row;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub notebook_id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

impl Conversation {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            notebook_id: row.get(1)?,
            title: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

impl Message {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Citation {
    pub id: String,
    pub message_id: String,
    pub chunk_id: String,
    pub relevance_score: f64,
}

#[derive(Debug, Deserialize)]
pub struct CreateConversation {
    pub notebook_id: String,
    pub title: Option<String>,
}
