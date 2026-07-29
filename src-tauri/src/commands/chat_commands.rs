/*
 * Name: chat_commands.rs
 * Purpose: Tauri command handlers for RAG-powered chat conversations.
 * Description: send_chat_message is async and runs on a blocking worker
 *   thread; sync commands execute on the main thread in Tauri v2,
 *   so a 30-120s LLM call would otherwise freeze every other IPC
 *   call. The pipeline is split into 3 phases so the DB lock is
 *   released before the LLM HTTP call.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use tauri::{Emitter, Manager, State};

use crate::database::models::{Conversation, Message};
use crate::database::repository::conversation_repository::{self, CitationSource};
use crate::error::{AppError, AppResult};
use crate::services::job_runner;
use crate::services::job_service::{PHASE_FINALIZE, PHASE_GENERATE, PHASE_PROMPT, PHASE_SOURCES};
use crate::services::rag_service;
use crate::state::AppState;

/// Roughly how long a chat answer runs to, for turning a token count into a
/// fraction. Only used to move a progress bar, so the exact value matters less
/// than it being in the right region.
const CHAT_ANSWER_CEILING: u32 = 900;

/// The channel Chat listens on for an answer being written.
pub const CHAT_PARTIAL_EVENT: &str = "chat-partial";

/// A partial answer, addressed to the conversation it belongs to so a window
/// showing a different thread ignores it.
#[derive(Clone, serde::Serialize)]
pub struct ChatPartial {
    pub conversation_id: String,
    pub content: String,
}

#[derive(serde::Serialize)]
pub struct ChatResponse {
    pub message_id: String,
    pub content: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn start_chat(
    state: State<'_, AppState>,
    notebook_id: String,
    title: Option<String>,
) -> AppResult<String> {
    let conn = state.conn()?;
    rag_service::start_conversation(&conn, &notebook_id, title)
}

/// Send a message and return the job id that will carry the answer.
///
/// This used to run the whole exchange inside the command while the frontend
/// awaited it. The answer was saved to the database either way, so the work was
/// never lost, but nothing told the user it was still coming: leaving Chat and
/// returning showed their question sitting alone with no reply and no sign that
/// one was on its way. As a job it reports the same phases as every other
/// feature, and rejoining the page rejoins the work.
#[tauri::command(rename_all = "snake_case")]
pub fn send_chat_message(
    app: tauri::AppHandle,
    conversation_id: String,
    notebook_id: String,
    message: String,
) -> AppResult<String> {
    if message.trim().is_empty() {
        return Err(AppError::InvalidInput("Message cannot be empty".into()));
    }

    if message.chars().count() > 50_000 {
        return Err(AppError::InvalidInput(
            "Message too long (max 50,000 characters)".into(),
        ));
    }

    /* The label is the question itself, trimmed: with several generations in
    flight the status bar has to say which one this is. */
    let label = crate::utils::text_utils::truncate_to_char_boundary(message.trim(), 48).to_string();

    let nb = notebook_id.clone();
    job_runner::spawn_task(&app, "chat", &nb, &label, move |app, handle| {
        let state: State<'_, AppState> = app.state();
        let jobs = &state.jobs;

        /* Phase 0/1: embed the question, read the planned context window, then
        search and assemble. Both DB and provider locks are released before the
        model call, exactly as before. */
        handle.begin(jobs, PHASE_SOURCES);
        let (query_vector, context_window) = {
            let providers = state.provider_read()?;
            (
                providers.embed(&message).ok().flatten(),
                providers.planned_context_window(),
            )
        };
        let rag_context = {
            let conn = state.conn()?;
            rag_service::prepare_rag_context(
                &conn,
                &conversation_id,
                &notebook_id,
                &message,
                query_vector.as_deref(),
                context_window,
            )?
        };
        handle.finish_phase(jobs, PHASE_SOURCES);
        handle.begin(jobs, PHASE_PROMPT);
        handle.finish_phase(jobs, PHASE_PROMPT);
        if handle.cancelled() {
            return Err(AppError::Internal("cancelled".into()));
        }

        /* Phase 2: the model call, with no lock held.

        The answer is emitted as it is written so Chat can show it appearing
        rather than waiting for the whole reply. A ticker runs alongside so the
        bar advances even when the model is slow to say anything: reporting only
        from the token callback left it frozen at the phase boundary whenever a
        stream stayed quiet, which looks exactly like a hang. */
        handle.begin(jobs, PHASE_GENERATE);
        let response_content = {
            let providers = state.provider_read()?;
            let (key, is_local) = providers.active_profile();
            let expected = jobs.expected_generate_secs(&key, is_local);
            let written = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));

            let ticker = job_runner::Ticker::start(
                app,
                handle,
                expected,
                Some((std::sync::Arc::clone(&written), CHAT_ANSWER_CEILING)),
            );

            let counted = std::sync::Arc::clone(&written);
            let mut partial = String::new();
            let mut last = std::time::Instant::now();
            let mut on_token = |fragment: &str| {
                partial.push_str(fragment);
                counted.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                /* Throttled: a fast model emits hundreds of fragments a second
                and each one crossing to the webview would swamp it. */
                if last.elapsed() >= std::time::Duration::from_millis(120) {
                    last = std::time::Instant::now();
                    app.emit(
                        CHAT_PARTIAL_EVENT,
                        ChatPartial {
                            conversation_id: conversation_id.clone(),
                            content: partial.clone(),
                        },
                    )
                    .ok();
                }
            };
            let answer = rag_service::call_llm_streaming(&providers, &rag_context, &mut on_token);
            ticker.stop();
            answer?
        };
        handle.finish_phase(jobs, PHASE_GENERATE);

        /* Phase 3: save the answer and its citations. */
        handle.begin(jobs, PHASE_FINALIZE);
        let message_id = {
            let conn = state.conn()?;
            rag_service::save_response(
                &conn,
                &conversation_id,
                &response_content,
                &rag_context.sources,
            )?
        };
        handle.finish_phase(jobs, PHASE_FINALIZE);

        serde_json::to_string(&ChatResponse {
            message_id,
            content: response_content,
        })
        .map_err(|e| AppError::Internal(format!("Could not encode the reply: {e}")))
    })
}

/// Fetch the sources cited by an assistant message for display in the chat UI.
#[tauri::command(rename_all = "snake_case")]
pub fn get_message_citations(
    state: State<'_, AppState>,
    message_id: String,
) -> AppResult<Vec<CitationSource>> {
    let conn = state.conn()?;
    conversation_repository::get_citation_sources(&conn, &message_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_conversations(
    state: State<'_, AppState>,
    notebook_id: String,
) -> AppResult<Vec<Conversation>> {
    let conn = state.conn()?;
    conversation_repository::list_by_notebook(&conn, &notebook_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_chat_messages(
    state: State<'_, AppState>,
    conversation_id: String,
) -> AppResult<Vec<Message>> {
    let conn = state.conn()?;
    conversation_repository::get_messages(&conn, &conversation_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_conversation(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let conn = state.conn()?;
    conversation_repository::delete_conversation(&conn, &id)
}
