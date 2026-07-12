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

/// A retrieved source chunk with its real relevance score, kept so citations
/// reflect the retrieval ranking instead of invented numbers.
pub struct RetrievedSource {
    pub chunk_id: String,
    pub score: f64,
}

/// Collected data from Phase 1 (DB read) needed for LLM call.
pub struct RagContext {
    pub messages: Vec<ChatMessage>,
    pub sources: Vec<RetrievedSource>,
}

/// Phase 1: Read from database (needs db lock). Returns context for LLM call.
/// `query_vector` is the embedded user question when the active provider
/// supports embeddings; hybrid search then blends semantic and keyword hits.
pub fn prepare_rag_context(
    conn: &Connection,
    conversation_id: &str,
    notebook_id: &str,
    user_message: &str,
    query_vector: Option<&[f32]>,
) -> AppResult<RagContext> {
    /* Verify conversation belongs to this notebook */
    let convo = conversation_repository::get_conversation(conn, conversation_id)?;
    if convo.notebook_id != notebook_id {
        return Err(AppError::InvalidInput(
            "Conversation does not belong to this notebook".into(),
        ));
    }

    /* Save the user message */
    conversation_repository::add_message(conn, conversation_id, "user", user_message)?;

    /* Search for relevant chunks (hybrid when a query embedding exists) */
    let search_results = search_service::search_chunks_hybrid(
        conn,
        notebook_id,
        user_message,
        query_vector,
        RAG_TOP_K,
    )?;

    /* Assemble context from search results. Labels carry the document title
    so the model can actually satisfy the prompt's citation format. */
    let context = search_results
        .iter()
        .enumerate()
        .map(|(i, r)| {
            let source_label = if let Some(page) = r.page_number {
                format!(
                    "[Source {}: document='{}', heading='{}', page={}]",
                    i + 1,
                    r.document_title,
                    r.heading_context,
                    page
                )
            } else {
                format!(
                    "[Source {}: document='{}', heading='{}']",
                    i + 1,
                    r.document_title,
                    r.heading_context
                )
            };
            format!("{}\n{}\n", source_label, r.content)
        })
        .collect::<Vec<_>>()
        .join("\n---\n");

    /* Build LLM messages */
    let mut messages = vec![ChatMessage {
        role: MessageRole::System,
        content: RAG_SYSTEM_PROMPT.to_string(),
    }];

    /* Document context uses User role to separate from system instructions.
    This reduces the privilege level of injected content from adversarial documents. */
    if !context.is_empty() {
        messages.push(ChatMessage {
            role: MessageRole::User,
            content: format!("<document_context>\n{context}\n</document_context>\n\nBased on these documents, answer the following question:"),
        });
    }

    /* Add conversation history. Fetch MAX+1 because the just-saved user message
    is already in the DB but will appear in the user's current turn below. */
    let history = conversation_repository::get_recent_messages(
        conn,
        conversation_id,
        MAX_HISTORY_MESSAGES + 1,
    )?;
    /* Skip the last message (the one we just saved) to avoid duplication */
    let history_without_current = if history
        .last()
        .map(|m| m.role == "user" && m.content == user_message)
        .unwrap_or(false)
    {
        &history[..history.len() - 1]
    } else {
        &history
    };
    for msg in history_without_current {
        messages.push(ChatMessage {
            role: if msg.role == "user" {
                MessageRole::User
            } else {
                MessageRole::Assistant
            },
            content: msg.content.clone(),
        });
    }

    let sources: Vec<RetrievedSource> = search_results
        .iter()
        .map(|r| RetrievedSource {
            chunk_id: r.chunk_id.clone(),
            score: r.score,
        })
        .collect();

    Ok(RagContext { messages, sources })
}

/// Phase 2: Call LLM provider (no locks needed).
pub fn call_llm(providers: &ProviderRouter, context: &RagContext) -> AppResult<String> {
    let response = providers
        .chat_completion(ChatRequest {
            messages: context.messages.clone(),
            max_tokens: Some(2048),
            temperature: Some(0.3),
        })
        .map_err(|e| AppError::Provider(e.to_string()))?;

    Ok(response.content)
}

/// Phase 3: Save response and citations (needs db lock).
pub fn save_response(
    conn: &Connection,
    conversation_id: &str,
    response_content: &str,
    sources: &[RetrievedSource],
) -> AppResult<String> {
    let assistant_msg =
        conversation_repository::add_message(conn, conversation_id, "assistant", response_content)?;

    /* Store real retrieval scores for the top sources that shaped the answer */
    for source in sources.iter().take(5) {
        conversation_repository::add_citation(
            conn,
            &assistant_msg.id,
            &source.chunk_id,
            source.score,
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

    let convo = conversation_repository::create_conversation(
        conn,
        CreateConversation {
            notebook_id: notebook_id.to_string(),
            title,
        },
    )?;

    Ok(convo.id)
}
