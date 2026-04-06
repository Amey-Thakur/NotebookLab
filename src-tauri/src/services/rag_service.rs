/*
 * Title: rag_service.rs
 * Tech Stack: Rust
 * Description: RAG (Retrieval-Augmented Generation) pipeline. Orchestrates:
 *   search chunks -> assemble context -> call LLM -> save response + citations.
 * Important Details: The pipeline is split into phases to minimize lock duration.
 *   Phase 1 (DB read): search + history fetch. Phase 2 (no locks): LLM call.
 *   Phase 3 (DB write): save response + citations. Conversation history is capped
 *   to the last 20 messages to stay within model context windows.
 */

use rusqlite::Connection;

use crate::database::models::CreateConversation;
use crate::database::repository::conversation_repository;
use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole, ProviderRouter};
use crate::services::search_service;


const RAG_SYSTEM_PROMPT: &str = include_str!("../../resources/prompts/rag-system.txt");
const RAG_TOP_K: usize = 10;
const MAX_HISTORY_MESSAGES: usize = 20;


/// Collected data from Phase 1 (DB read) needed for LLM call.
pub struct RagContext {
    pub messages: Vec<ChatMessage>,
    pub chunk_ids: Vec<String>,
}


/// Phase 1: Read from database (needs db lock). Returns context for LLM call.
pub fn prepare_rag_context(
    conn: &Connection,
    conversation_id: &str,
    notebook_id: &str,
    user_message: &str,
) -> AppResult<RagContext> {
    /* Verify conversation belongs to this notebook */
    let convo = conversation_repository::get_conversation(conn, conversation_id)?;
    if convo.notebook_id != notebook_id {
        return Err(AppError::InvalidInput("Conversation does not belong to this notebook".into()));
    }

    /* Save the user message */
    conversation_repository::add_message(conn, conversation_id, "user", user_message)?;

    /* Search for relevant chunks */
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

    /* Build LLM messages */
    let mut messages = vec![
        ChatMessage {
            role: MessageRole::System,
            content: RAG_SYSTEM_PROMPT.to_string(),
        },
    ];

    if !context.is_empty() {
        messages.push(ChatMessage {
            role: MessageRole::System,
            content: format!("Relevant document excerpts:\n\n{context}"),
        });
    }

    /* Add conversation history (capped to prevent context overflow) */
    let history = conversation_repository::get_messages(conn, conversation_id)?;
    let start = if history.len() > MAX_HISTORY_MESSAGES {
        history.len() - MAX_HISTORY_MESSAGES
    } else {
        0
    };
    for msg in &history[start..] {
        messages.push(ChatMessage {
            role: if msg.role == "user" { MessageRole::User } else { MessageRole::Assistant },
            content: msg.content.clone(),
        });
    }

    let chunk_ids: Vec<String> = search_results.iter().map(|r| r.chunk_id.clone()).collect();

    Ok(RagContext { messages, chunk_ids })
}


/// Phase 2: Call LLM provider (no locks needed).
pub fn call_llm(
    providers: &ProviderRouter,
    context: &RagContext,
) -> AppResult<String> {
    let response = providers.chat_completion(ChatRequest {
        messages: context.messages.clone(),
        max_tokens: Some(2048),
        temperature: Some(0.3),
    }).map_err(|e| AppError::Provider(e.to_string()))?;

    Ok(response.content)
}


/// Phase 3: Save response and citations (needs db lock).
pub fn save_response(
    conn: &Connection,
    conversation_id: &str,
    response_content: &str,
    chunk_ids: &[String],
) -> AppResult<String> {
    let assistant_msg = conversation_repository::add_message(
        conn,
        conversation_id,
        "assistant",
        response_content,
    )?;

    /* Only save citations for chunks that were actually used (top 5, not all 10) */
    for (i, chunk_id) in chunk_ids.iter().take(5).enumerate() {
        let relevance = 1.0 - (i as f64 * 0.15);
        conversation_repository::add_citation(
            conn,
            &assistant_msg.id,
            chunk_id,
            relevance.max(0.25),
        )?;
    }

    Ok(assistant_msg.id)
}


/// Start a new RAG conversation in a notebook.
pub fn start_conversation(
    conn: &Connection,
    notebook_id: &str,
    title: Option<String>,
) -> AppResult<String> {
    /* Validate notebook exists by trying to read it */
    crate::database::repository::notebook_repository::get_by_id(conn, notebook_id)?;

    let convo = conversation_repository::create_conversation(conn, CreateConversation {
        notebook_id: notebook_id.to_string(),
        title,
    })?;

    Ok(convo.id)
}
