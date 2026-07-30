/*
 * Name: thinking_commands.rs
 * Purpose: Tauri commands for the Thinking Partner feature.
 * Description: Async commands running on blocking worker threads; sync
 *   commands would hold the main thread through the LLM call. DB
 *   and LLM phases are split so the database lock is released
 *   before the HTTP request.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use crate::database::repository::chunk_repository;
use crate::error::{AppError, AppResult};
use crate::providers::TaskPurpose;
use crate::services::job_runner::{self, Generation};
use crate::services::search_service;

/// Gather passages for a thinking prompt: the best keyword matches for the
/// topic, or a spread across the notebook when nothing matches.
///
/// A topic worded differently from the documents (or simply mistyped) finds
/// nothing by keyword even when the notebook is full, and the old behaviour
/// told the user to import documents they had already imported. Falling back
/// to a sample keeps the feature working on the sources that are actually
/// there; only a genuinely empty notebook is an error.
///
/// `documents` restricts the sources to the ones the user picked. Empty means
/// the whole notebook. The filter is applied after retrieval rather than inside
/// the search so that a selection which happens to match nothing by keyword
/// still falls back to a sample of *those* documents, not of the notebook.
fn gather_context(
    conn: &rusqlite::Connection,
    notebook_id: &str,
    topic: &str,
    limit: usize,
    documents: &[String],
) -> AppResult<String> {
    let passages = if documents.is_empty() {
        let matches = search_service::search_chunks(conn, notebook_id, topic, limit)?;
        if matches.is_empty() {
            chunk_repository::sample_for_notebook(conn, notebook_id, limit)?
        } else {
            matches.into_iter().map(|c| c.content).collect()
        }
    } else {
        chunk_repository::sample_for_documents(conn, documents, limit)?
    };

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

/* Thinking Partner used the same mind-map prompt as the Studio, so the two
features produced the same output from the same sources and one of them was
redundant. The Studio keeps the mind map, which is what an outline of a topic
should look like. This asks a different question: how the ideas stand against
each other, and where the thinking is unfinished. */
const IDEA_SPACE_PROMPT: &str = include_str!("../../resources/prompts/idea-space.txt");
const SOCRATIC_PROMPT: &str = include_str!("../../resources/prompts/socratic.txt");

/// Start an idea space and return its job id at once.
///
/// `document_ids` narrows the sources to the documents the user picked; empty
/// means the whole notebook, which is what it always did.
#[tauri::command(rename_all = "snake_case")]
pub fn generate_idea_space(
    app: tauri::AppHandle,
    notebook_id: String,
    topic: String,
    document_ids: Option<Vec<String>>,
) -> AppResult<String> {
    if topic.trim().is_empty() {
        return Err(AppError::InvalidInput("Topic cannot be empty".into()));
    }

    let docs = document_ids.unwrap_or_default();
    let (nb, tp) = (notebook_id.clone(), topic.clone());
    job_runner::spawn(
        &app,
        Generation {
            kind: "ideaspace",
            label: format!("Idea space: {}", topic.trim()),
            notebook_id,
            system_prompt: IDEA_SPACE_PROMPT.to_string(),
            max_tokens: 2048,
            /* A shade warmer than the Studio's mind map: naming a tension takes
            more interpretation than listing themes, and at 0.3 models tend to
            restate the headings instead. */
            temperature: 0.4,
            purpose: TaskPurpose::Quality,
        },
        Box::new(move |conn| gather_context(conn, &nb, &tp, 15, &docs)),
        Box::new(move |context| {
            format!(
                "<document_context>\n{context}\n</document_context>\n\n\
                 Map the ideas, tensions and open questions around: {topic}"
            )
        }),
        Box::new(Ok),
    )
}

/// Start a Socratic questioning run and return its job id at once.
#[tauri::command(rename_all = "snake_case")]
pub fn generate_socratic_questions(
    app: tauri::AppHandle,
    notebook_id: String,
    thinking: String,
    document_ids: Option<Vec<String>>,
) -> AppResult<String> {
    if thinking.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "Describe your current thinking first".into(),
        ));
    }

    let docs = document_ids.unwrap_or_default();
    let (nb, th) = (notebook_id.clone(), thinking.clone());
    job_runner::spawn(
        &app,
        Generation {
            kind: "socratic",
            label: "Socratic questions".to_string(),
            notebook_id,
            system_prompt: SOCRATIC_PROMPT.to_string(),
            max_tokens: 1024,
            temperature: 0.7,
            purpose: TaskPurpose::Quality,
        },
        Box::new(move |conn| gather_context(conn, &nb, &th, 10, &docs)),
        Box::new(move |context| {
            format!(
                "<document_context>\n{context}\n</document_context>\n\n\
                 My current thinking:\n{thinking}\n\nAsk me probing questions."
            )
        }),
        Box::new(Ok),
    )
}
