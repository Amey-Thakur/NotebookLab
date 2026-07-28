/*
 * Name: transform_commands.rs
 * Purpose: Tauri commands for content transformations.
 * Description: Async command on a blocking worker thread so the LLM call
 *   never occupies the main thread. Chunks are fetched and capped
 *   at ~8000 tokens in the DB phase, then the LLM phase runs
 *   without any database lock.
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
use crate::services::transform_service::TransformType;

const TRANSFORM_PROMPT: &str = include_str!("../../resources/prompts/content-transform.txt");

/// Roughly how much of a document to hand the model. Beyond this the prompt
/// stops being cheaper than the answer is worth, and long-context models still
/// degrade on the middle of a very long input.
const TRANSFORM_TOKEN_BUDGET: usize = 8000;

/// Start a transformation and return its job id at once.
#[tauri::command(rename_all = "snake_case")]
pub fn transform_document(
    app: tauri::AppHandle,
    document_id: String,
    notebook_id: String,
    transform_type: TransformType,
    custom_prompt: Option<String>,
) -> AppResult<String> {
    if document_id.trim().is_empty() {
        return Err(AppError::InvalidInput("Document ID is required".into()));
    }

    let instruction = transform_type.instruction(custom_prompt.as_deref());
    job_runner::spawn(
        &app,
        Generation {
            kind: "transform",
            label: transform_type.label().to_string(),
            notebook_id,
            system_prompt: TRANSFORM_PROMPT.to_string(),
            max_tokens: 2048,
            temperature: 0.3,
            purpose: TaskPurpose::Balanced,
        },
        Box::new(move |conn| gather_document_text(conn, &document_id)),
        Box::new(move |text| format!("{instruction}\n\n<document_text>\n{text}\n</document_text>")),
        Box::new(Ok),
    )
}

/// Read a document's text up to the prompt budget.
fn gather_document_text(conn: &rusqlite::Connection, document_id: &str) -> AppResult<String> {
    let chunks = chunk_repository::get_by_document(conn, document_id)?;
    if chunks.is_empty() {
        return Err(AppError::InvalidInput(
            "Document has no content to transform. It may still be processing.".into(),
        ));
    }

    let mut text = String::new();
    let mut tokens = 0usize;
    for chunk in &chunks {
        let cost = chunk.token_count.max(0) as usize;
        /* Test before adding, not after. The old order checked the running
        total first and then appended anyway, so the budget was always
        exceeded by one chunk and an oversized first chunk was admitted whole
        however large it was. */
        if !text.is_empty() && tokens + cost > TRANSFORM_TOKEN_BUDGET {
            break;
        }
        if !text.is_empty() {
            text.push_str("\n\n");
        }
        text.push_str(&chunk.content);
        tokens += cost;
    }

    Ok(text)
}
