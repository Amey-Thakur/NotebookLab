/*
 * Title: rag_service.rs
 * Tech Stack: Rust
 * Description: RAG (Retrieval-Augmented Generation) pipeline. Orchestrates:
 *   search chunks -> assemble context -> call LLM -> save response + citations.
 * Important Details: Context is assembled by concatenating top-K search results with
 *   source attribution markers. The system prompt instructs the LLM to cite sources.
 *   Citations are extracted from [Source: ...] patterns in the response.
 */

use rusqlite::Connection;

use crate::database::models::CreateConversation;
use crate::database::repository::conversation_repository;
use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole, ProviderRouter};
use crate::services::search_service;


const RAG_SYSTEM_PROMPT: &str = include_str!("../resources/prompts/rag-system.txt");
const RAG_TOP_K: usize = 10;


/// Send a user message in a RAG-powered conversation.
/// Searches for relevant chunks, builds context, calls the LLM, and saves the response.
pub fn send_message(
    conn: &Connection,
    providers: &ProviderRouter,
    conversation_id: &str,
    notebook_id: &str,
    user_message: &str,
) -> AppResult<(String, String)> {
    /* Verify conversation belongs to this notebook */
    let convo = conversation_repository::get_conversation(conn, conversation_id)?;
    if convo.notebook_id != notebook_id {
        return Err(AppError::InvalidInput("Conversation does not belong to this notebook".into()));
    }

    /* Save the user message */
    conversation_repository::add_message(conn, conversation_id, "user", user_message)?;

    /* Search for relevant chunks in the notebook */
    let search_results = search_service::search_chunks(conn, notebook_id, user_message, RAG_TOP_K)?;

    /* Assemble context from search results */
    let context = search_results
        .iter()
        .enumerate()
        .map(|(i, r)| {
            let source_label = if let Some(page) = r.page_number {
                format!("[Source {}: heading='{}', page={}]", i + 1, r.heading_context, page)
            } else {
                format!("[Source {}: heading='{}']", i + 1, r.heading_context)
            };
            format!("{}\n{}\n", source_label, r.content)
        })
        .collect::<Vec<_>>()
        .join("\n---\n");

    /* Build the LLM request with system prompt + context + conversation history */
    let mut messages = vec![
        ChatMessage {
            role: MessageRole::System,
            content: RAG_SYSTEM_PROMPT.to_string(),
        },
    ];

    /* Add context as a system-level document block */
    if !context.is_empty() {
        messages.push(ChatMessage {
            role: MessageRole::System,
            content: format!("Relevant document excerpts:\n\n{context}"),
        });
    }

    /* Add conversation history */
    let history = conversation_repository::get_messages(conn, conversation_id)?;
    for msg in &history {
        messages.push(ChatMessage {
            role: if msg.role == "user" { MessageRole::User } else { MessageRole::Assistant },
            content: msg.content.clone(),
        });
    }

    /* Call the LLM provider */
    let response = providers.chat_completion(ChatRequest {
        messages,
        max_tokens: Some(2048),
        temperature: Some(0.3),
    }).map_err(|e| AppError::Provider(e.to_string()))?;

    /* Save the assistant response */
    let assistant_msg = conversation_repository::add_message(
        conn,
        conversation_id,
        "assistant",
        &response.content,
    )?;

    /* Save citations linking the response to source chunks */
    for (i, result) in search_results.iter().enumerate() {
        let relevance = 1.0 - (i as f64 * 0.1); // Top result = 1.0, decreasing
        conversation_repository::add_citation(
            conn,
            &assistant_msg.id,
            &result.chunk_id,
            relevance.max(0.1),
        )?;
    }

    Ok((assistant_msg.id, response.content))
}


/// Start a new RAG conversation in a notebook.
pub fn start_conversation(
    conn: &Connection,
    notebook_id: &str,
    title: Option<String>,
) -> AppResult<String> {
    let convo = conversation_repository::create_conversation(conn, CreateConversation {
        notebook_id: notebook_id.to_string(),
        title,
    })?;

    Ok(convo.id)
}
