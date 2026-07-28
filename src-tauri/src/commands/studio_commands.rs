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

use crate::database::repository::chunk_repository;
use crate::error::{AppError, AppResult};
use crate::providers::TaskPurpose;
use crate::services::job_runner::{self, Generation};
use crate::services::search_service;

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
/// `document_ids` narrows the sources to the documents the user picked; empty
/// or absent means the whole notebook.
///
/// Returns a job id, not the text. The generation runs as a tracked job so it
/// reports progress and survives the user leaving the page.
#[tauri::command(rename_all = "snake_case")]
pub fn generate_studio(
    app: tauri::AppHandle,
    notebook_id: String,
    format: String,
    focus: String,
    document_ids: Option<Vec<String>>,
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

    let docs = document_ids.unwrap_or_default();
    let (nb, fc) = (notebook_id.clone(), focus.clone());
    job_runner::spawn(
        &app,
        Generation {
            kind: "studio",
            label: label_for(&format),
            notebook_id,
            system_prompt: system_prompt.to_string(),
            max_tokens: 2048,
            temperature: 0.3,
            purpose: TaskPurpose::Quality,
        },
        Box::new(move |conn| gather_sources(conn, &nb, &fc, &docs)),
        Box::new(move |context| {
            let directive = if focus.trim().is_empty() {
                "Work from all of these sources.".to_string()
            } else {
                format!("Focus especially on: {}", focus.trim())
            };
            format!("<document_context>\n{context}\n</document_context>\n\n{directive}")
        }),
        Box::new(Ok),
    )
}

/// Read the passages a Studio format is built from.
///
/// `documents` is the user's explicit choice of sources; empty means the whole
/// notebook, which is what it always did.
fn gather_sources(
    conn: &rusqlite::Connection,
    notebook_id: &str,
    focus: &str,
    documents: &[String],
) -> AppResult<String> {
    let mut passages: Vec<String> = if !documents.is_empty() {
        chunk_repository::sample_for_documents(conn, documents, 20)?
    } else if focus.trim().is_empty() {
        chunk_repository::sample_for_notebook(conn, notebook_id, 20)?
    } else {
        search_service::search_chunks(conn, notebook_id, focus, 15)?
            .into_iter()
            .map(|c| c.content)
            .collect()
    };

    /* A focus worded differently from the sources (or mistyped) matches
    nothing by keyword even when the notebook is full. Widen to the whole
    notebook rather than refusing: covering the sources broadly beats
    telling the user to import documents they already have. */
    if passages.is_empty() && documents.is_empty() && !focus.trim().is_empty() {
        passages = chunk_repository::sample_for_notebook(conn, notebook_id, 20)?;
    }

    if passages.is_empty() {
        return Err(AppError::InvalidInput(if documents.is_empty() {
            "This notebook has no documents yet. Import one first.".into()
        } else {
            "The selected documents have no readable text yet. They may still \
             be processing."
                .to_string()
        }));
    }

    Ok(passages.join("\n\n---\n\n"))
}

/// Human label for a format, shown next to the progress bar.
fn label_for(format: &str) -> String {
    match format {
        "study_guide" => "Study guide",
        "flashcards" => "Flashcards",
        "quiz" => "Quiz",
        "mind_map" => "Mind map",
        "timeline" => "Timeline",
        "slide_deck" => "Slide deck",
        "data_table" => "Data table",
        "briefing" => "Briefing doc",
        "blog_post" => "Blog post",
        other => other,
    }
    .to_string()
}
