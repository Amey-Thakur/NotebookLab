/*
 * Name: studio_commands.rs
 * Purpose: Tauri commands for the Studio, which turns a notebook's sources into
 *   study aids and write-ups: a study guide, flashcards, a quiz, a mind map, a
 *   timeline, a slide deck, a data table, a briefing doc, and a blog post.
 * Description: One async command grounds every format in the notebook's own
 *   documents, so nothing is invented. Work runs on a blocking worker thread
 *   and the database lock is released before the LLM call, matching the rest
 *   of the AI features. When a focus is given the most relevant passages are
 *   used; otherwise a spread across the whole notebook is sampled. The model's
 *   text is returned as-is and parsed on the frontend per format.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

use tauri::{Manager, State};

use crate::database::repository::chunk_repository;
use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole};
use crate::services::search_service;
use crate::state::AppState;

const STUDY_GUIDE_PROMPT: &str = include_str!("../../resources/prompts/studio-study-guide.txt");
const FLASHCARDS_PROMPT: &str = include_str!("../../resources/prompts/studio-flashcards.txt");
const QUIZ_PROMPT: &str = include_str!("../../resources/prompts/studio-quiz.txt");
const MIND_MAP_PROMPT: &str = include_str!("../../resources/prompts/mind-map.txt");
const TIMELINE_PROMPT: &str = include_str!("../../resources/prompts/studio-timeline.txt");
const SLIDE_DECK_PROMPT: &str = include_str!("../../resources/prompts/studio-slide-deck.txt");
const DATA_TABLE_PROMPT: &str = include_str!("../../resources/prompts/studio-data-table.txt");
const BRIEFING_PROMPT: &str = include_str!("../../resources/prompts/studio-briefing.txt");
const BLOG_POST_PROMPT: &str = include_str!("../../resources/prompts/studio-blog-post.txt");

/// Generate one Studio format grounded in a notebook's sources.
///
/// `format` is one of: study_guide, flashcards, quiz, mind_map, timeline,
/// slide_deck, data_table, briefing, blog_post.
/// `focus` is optional; empty means cover the whole notebook.
#[tauri::command(rename_all = "snake_case")]
pub async fn generate_studio(
    app: tauri::AppHandle,
    notebook_id: String,
    format: String,
    focus: String,
) -> AppResult<String> {
    let system_prompt = match format.as_str() {
        "study_guide" => STUDY_GUIDE_PROMPT,
        "flashcards" => FLASHCARDS_PROMPT,
        "quiz" => QUIZ_PROMPT,
        "mind_map" => MIND_MAP_PROMPT,
        "timeline" => TIMELINE_PROMPT,
        "slide_deck" => SLIDE_DECK_PROMPT,
        "data_table" => DATA_TABLE_PROMPT,
        "briefing" => BRIEFING_PROMPT,
        "blog_post" => BLOG_POST_PROMPT,
        other => {
            return Err(AppError::InvalidInput(format!(
                "Unknown Studio format: {other}"
            )));
        }
    };

    tauri::async_runtime::spawn_blocking(move || {
        let state: State<'_, AppState> = app.state();

        /* Phase 1: read the sources, then release the database lock */
        let context = {
            let conn = state.conn()?;
            let passages: Vec<String> = if focus.trim().is_empty() {
                chunk_repository::sample_for_notebook(&conn, &notebook_id, 20)?
            } else {
                search_service::search_chunks(&conn, &notebook_id, &focus, 15)?
                    .into_iter()
                    .map(|c| c.content)
                    .collect()
            };

            if passages.is_empty() {
                return Err(AppError::InvalidInput(
                    "No documents to work from yet. Import a document into this notebook first."
                        .into(),
                ));
            }

            passages.join("\n\n---\n\n")
        };

        /* Phase 2: the LLM call, with no database lock held */
        let directive = if focus.trim().is_empty() {
            "Work from all of these sources.".to_string()
        } else {
            format!("Focus especially on: {}", focus.trim())
        };

        let providers = state.provider_read()?;
        let response = providers
            .chat_completion(ChatRequest {
                messages: vec![
                    ChatMessage {
                        role: MessageRole::System,
                        content: system_prompt.to_string(),
                    },
                    ChatMessage {
                        role: MessageRole::User,
                        content: format!(
                            "<document_context>\n{context}\n</document_context>\n\n{directive}"
                        ),
                    },
                ],
                max_tokens: Some(2048),
                temperature: Some(0.3),
            })
            .map_err(|e| AppError::Provider(e.to_string()))?;

        Ok(response.content)
    })
    .await
    .map_err(|e| AppError::Internal(format!("Studio task failed: {e}")))?
}
