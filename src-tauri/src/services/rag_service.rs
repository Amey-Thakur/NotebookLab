/*
 * Name: rag_service.rs
 * Purpose: RAG (Retrieval-Augmented Generation) pipeline.
 * Description: Orchestrates: search chunks -> assemble context -> call LLM ->
 *   save response + citations. The pipeline is split into phases
 *   to minimize lock duration. Phase 1 (DB read): search + history
 *   fetch. Phase 2 (no locks): LLM call. Phase 3 (DB write): save
 *   response + citations. Conversation history is capped to the
 *   last 20 messages to stay within model context windows.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use rusqlite::Connection;

use crate::database::models::CreateConversation;
use crate::database::repository::{conversation_repository, note_repository};
use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole, ProviderRouter, TaskPurpose};
use crate::services::search_service;

const RAG_SYSTEM_PROMPT: &str = include_str!("../../resources/prompts/rag-system.txt");
const RAG_TOP_K: usize = 10;
const MAX_HISTORY_MESSAGES: usize = 20;
/* Reserved room inside the context window: the answer itself plus headroom
for tokenizer variance, since chars/4 is an estimate. */
const ANSWER_TOKENS: u32 = 2048;
const SAFETY_MARGIN_TOKENS: u32 = 256;
/* The note map stays small: it is a hint, not the payload. */
const NOTE_MAP_MAX_EDGES: usize = 40;

/// Rough token estimate (~4 characters per token for English-like text).
/// Used only for context budgeting, never for the usage display, which shows
/// real numbers reported by providers.
fn estimate_tokens(text: &str) -> u32 {
    (text.len() as u32) / 4 + 1
}

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
    context_window: u32,
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

    /* Build LLM messages: system, then prior conversation, then the retrieved
    context and the current question together as the final user turn. */
    let mut messages = vec![ChatMessage {
        role: MessageRole::System,
        content: RAG_SYSTEM_PROMPT.to_string(),
    }];

    /* Prior conversation. Fetch MAX+1 because the just-saved user message is in
    the DB; drop it here so it does not duplicate the current turn added below. */
    let history = conversation_repository::get_recent_messages(
        conn,
        conversation_id,
        MAX_HISTORY_MESSAGES + 1,
    )?;
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

    /* A compact map of how the notebook's notes link, so the model starts
    with the shape of this body of work, not just isolated passages. */
    let note_map = build_note_map(conn, notebook_id);

    /* Pack retrieved chunks into what the model's context window actually
    has room for: window minus the fixed costs (system prompt, history, the
    question, the note map, the reserved answer room). Chunks arrive ranked
    by relevance, so filling in order keeps the best ones. Citations are
    built ONLY from the chunks that made it in, so every citation refers to
    something the model really saw. */
    let fixed_cost = estimate_tokens(RAG_SYSTEM_PROMPT)
        + messages[1..]
            .iter()
            .map(|m| estimate_tokens(&m.content))
            .sum::<u32>()
        + estimate_tokens(user_message)
        + estimate_tokens(&note_map)
        + ANSWER_TOKENS
        + SAFETY_MARGIN_TOKENS;
    let mut budget = context_window.saturating_sub(fixed_cost).max(512);

    let mut context_blocks: Vec<String> = Vec::new();
    let mut sources: Vec<RetrievedSource> = Vec::new();
    for (i, r) in search_results.iter().enumerate() {
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
        let block = format!("{}\n{}\n", source_label, r.content);
        let cost = estimate_tokens(&block);
        if cost > budget && !context_blocks.is_empty() {
            /* Window full: later, lower-ranked chunks wait for a bigger
            model. Stop rather than truncate mid-passage. */
            break;
        }
        budget = budget.saturating_sub(cost);
        context_blocks.push(block);
        sources.push(RetrievedSource {
            chunk_id: r.chunk_id.clone(),
            score: r.score,
        });
    }
    let context = context_blocks.join("\n---\n");

    /* The current question is the final user turn. When retrieval found
    context, carry it in the same message at User role, so injected document
    text stays below system-instruction privilege. Without this final turn the
    model would receive context and history but never the actual question. */
    let final_turn = match (context.is_empty(), note_map.is_empty()) {
        (true, true) => user_message.to_string(),
        (true, false) => {
            format!("<document_context>\n{note_map}\n</document_context>\n\n{user_message}")
        }
        (false, _) => format!(
            "<document_context>\n{context}{}\n</document_context>\n\nBased on these documents, answer the following question:\n\n{user_message}",
            if note_map.is_empty() {
                String::new()
            } else {
                format!("\n---\n{note_map}")
            }
        ),
    };
    messages.push(ChatMessage {
        role: MessageRole::User,
        content: final_turn,
    });

    Ok(RagContext { messages, sources })
}

/// A one-line-per-link summary of the notebook's note connections, capped
/// small. Gives the model the lay of the land in a handful of tokens; empty
/// when the notebook has no linked notes.
fn build_note_map(conn: &Connection, notebook_id: &str) -> String {
    let Ok(graph) = note_repository::notes_graph(conn, notebook_id) else {
        return String::new();
    };
    if graph.edges.is_empty() {
        return String::new();
    }

    let titles: std::collections::HashMap<&str, &str> = graph
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.title.as_str()))
        .collect();

    let links: Vec<String> = graph
        .edges
        .iter()
        .filter_map(|e| {
            let from = titles.get(e.source.as_str())?;
            let to = titles.get(e.target.as_str())?;
            Some(format!("{from} -> {to}"))
        })
        .take(NOTE_MAP_MAX_EDGES)
        .collect();

    if links.is_empty() {
        return String::new();
    }
    format!(
        "[Note map: how this notebook's notes link together]\n{}",
        links.join("; ")
    )
}

/// Most an answer from a model on this computer is allowed to run to.
///
/// The same reasoning as the generation features: time to answer scales with
/// tokens written, and a small model on a CPU writes slowly enough that a
/// 2048-token ceiling is minutes of silence. A chat answer rarely needs to be
/// that long anyway, and a shorter reply that arrives beats a longer one that
/// times out.
const LOCAL_CHAT_MAX_TOKENS: u32 = 900;

/// Phase 2: Call LLM provider (no locks needed).
pub fn call_llm(providers: &ProviderRouter, context: &RagContext) -> AppResult<String> {
    call_llm_streaming(providers, context, &mut |_| {})
}

/// Phase 2, reporting the answer as it is written.
///
/// Chat is where waiting is felt most: the user has asked a question and is
/// watching for the reply. Streaming turns minutes of nothing into words
/// appearing, without changing what is finally saved.
pub fn call_llm_streaming(
    providers: &ProviderRouter,
    context: &RagContext,
    on_token: &mut dyn FnMut(&str),
) -> AppResult<String> {
    let (_, is_local) = providers.active_profile();
    let request = ChatRequest {
        messages: context.messages.clone(),
        max_tokens: Some(if is_local {
            LOCAL_CHAT_MAX_TOKENS
        } else {
            2048
        }),
        temperature: Some(0.3),
        purpose: TaskPurpose::Balanced,
    };

    let response = if providers.active_supports_streaming() {
        providers.stream_chat_completion(request, on_token)
    } else {
        providers.chat_completion(request)
    }
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
