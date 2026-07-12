/*
 * Name: prompt_commands.rs
 * Purpose: Tauri command that refines a draft prompt with the active model.
 * Description: Async on a blocking worker so the LLM call never holds the main
 *   thread. Takes a structured draft and asks the model to rewrite it into a
 *   clear, well-scoped prompt following prompt-engineering principles, then
 *   returns the improved text. The composition itself happens in the
 *   frontend; this only sharpens what the user already built.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use tauri::Manager;

use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole};
use crate::state::AppState;

const REFINE_SYSTEM: &str = include_str!("../../resources/prompts/prompt-refine.txt");

/// Improve a draft prompt with the active provider.
/// Returns the rewritten prompt only, ready to copy or run.
#[tauri::command(rename_all = "snake_case")]
pub async fn refine_prompt(app: tauri::AppHandle, draft: String) -> AppResult<String> {
    if draft.trim().is_empty() {
        return Err(AppError::InvalidInput("Write a draft prompt first".into()));
    }
    if draft.len() > 20_000 {
        return Err(AppError::InvalidInput(
            "Draft too long (max 20,000 characters)".into(),
        ));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppState> = app.state();
        let providers = state.provider_read()?;
        let response = providers
            .chat_completion(ChatRequest {
                messages: vec![
                    ChatMessage {
                        role: MessageRole::System,
                        content: REFINE_SYSTEM.to_string(),
                    },
                    ChatMessage {
                        role: MessageRole::User,
                        content: format!("Rewrite this prompt:\n\n{draft}"),
                    },
                ],
                max_tokens: Some(1024),
                temperature: Some(0.4),
            })
            .map_err(|e| AppError::Provider(e.to_string()))?;

        Ok(response.content.trim().to_string())
    })
    .await
    .map_err(|e| AppError::Internal(format!("Refine task failed: {e}")))?
}
