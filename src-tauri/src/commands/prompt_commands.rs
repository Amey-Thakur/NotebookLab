/*
 * Name: prompt_commands.rs
 * Purpose: Tauri command that crafts a complete prompt with the active model.
 * Description: One command, two modes. "generate" takes a plain description of
 *   a job and writes the full, ready-to-run prompt for it; "refine" takes a
 *   draft prompt and rewrites it into its strongest version. Both apply the
 *   same prompt-engineering method (role, context, few-shot examples, chain of
 *   thought for reasoning tasks, structured output contracts, positive
 *   instructions, variables for unknowns) and return a JSON envelope with the
 *   prompt, recommended sampling settings, the variables to fill, and short
 *   notes on why the choices fit. The user's text is passed inside <task> tags
 *   as data, never as instructions. Async on a blocking worker so the LLM call
 *   never holds the main thread; the frontend parses the envelope tolerantly.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

use tauri::Manager;

use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole, TaskPurpose};
use crate::state::AppState;

const GENERATE_SYSTEM: &str = include_str!("../../resources/prompts/prompt-generate.txt");
const REFINE_SYSTEM: &str = include_str!("../../resources/prompts/prompt-refine.txt");

/// Craft a prompt with the active provider.
///
/// `mode` is "generate" (input is a plain-words job description) or "refine"
/// (input is a draft prompt to improve). Returns the model's JSON envelope as
/// text; the frontend parses it and falls back gracefully if it is malformed.
#[tauri::command(rename_all = "snake_case")]
pub async fn craft_prompt(app: tauri::AppHandle, input: String, mode: String) -> AppResult<String> {
    if input.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "Describe the job or write a draft first".into(),
        ));
    }
    if input.chars().count() > 20_000 {
        return Err(AppError::InvalidInput(
            "Input too long (max 20,000 characters)".into(),
        ));
    }

    let system = match mode.as_str() {
        "generate" => GENERATE_SYSTEM,
        "refine" => REFINE_SYSTEM,
        other => {
            return Err(AppError::InvalidInput(format!(
                "Unknown prompt mode: {other}"
            )));
        }
    };

    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppState> = app.state();
        let providers = state.provider_read()?;
        let response = providers
            .chat_completion(ChatRequest {
                messages: vec![
                    ChatMessage {
                        role: MessageRole::System,
                        content: system.to_string(),
                    },
                    ChatMessage {
                        role: MessageRole::User,
                        content: format!("<task>\n{input}\n</task>"),
                    },
                ],
                max_tokens: Some(2048),
                temperature: Some(0.3),
                purpose: TaskPurpose::Quality,
            })
            .map_err(|e| AppError::Provider(e.to_string()))?;

        Ok(response.content.trim().to_string())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Prompt task failed: {e}")))?
}
