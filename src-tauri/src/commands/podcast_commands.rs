/*
 * Name: podcast_commands.rs
 * Purpose: Tauri commands for AI audio-overview script generation.
 * Description: Uses the active LLM provider to generate a spoken-overview script
 *   from document context in one of several formats: a two-host
 *   discussion, a single-narrator brief, a debate, or a critique.
 *   The chosen format's prompt is loaded from a file and the
 *   document text is passed as data inside <document_context>, so
 *   source content is never treated as instructions. The Rust
 *   backend handles script generation only; audio synthesis is
 *   handled by the frontend using the browser's SpeechSynthesis API
 *   (offline, cross-platform, zero-config). This can be upgraded to
 *   Piper/Kokoro TTS later for higher quality voices.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use tauri::Manager;

use crate::error::{AppError, AppResult};
use crate::providers::traits::{ChatMessage, ChatRequest, MessageRole, TaskPurpose};
use crate::state::AppState;

const DISCUSSION_PROMPT: &str = include_str!("../../resources/prompts/podcast-discussion.txt");
const BRIEF_PROMPT: &str = include_str!("../../resources/prompts/podcast-brief.txt");
const DEBATE_PROMPT: &str = include_str!("../../resources/prompts/podcast-debate.txt");
const CRITIQUE_PROMPT: &str = include_str!("../../resources/prompts/podcast-critique.txt");
const INTERVIEW_PROMPT: &str = include_str!("../../resources/prompts/podcast-interview.txt");
const LECTURE_PROMPT: &str = include_str!("../../resources/prompts/podcast-lecture.txt");
const QANDA_PROMPT: &str = include_str!("../../resources/prompts/podcast-qanda.txt");

/// A single turn in the podcast script.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PodcastTurn {
    pub speaker: String,
    pub text: String,
}

/// Generated podcast script.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PodcastScript {
    pub title: String,
    pub turns: Vec<PodcastTurn>,
}

/// Generate a podcast script from documents in a notebook.
/// Returns structured turns that the frontend can synthesize with Web Speech API.
/// Async on a blocking worker so script generation never stalls the main thread.
#[tauri::command(rename_all = "snake_case")]
pub async fn generate_podcast(
    app: tauri::AppHandle,
    notebook_id: String,
    topic: Option<String>,
    format: Option<String>,
) -> AppResult<PodcastScript> {
    tauri::async_runtime::spawn_blocking(move || {
        let app_state: tauri::State<'_, AppState> = app.state();

        /* Get document chunks for context */
        let chunks = {
            let conn = app_state.conn()?;
            let mut stmt = conn.prepare(
                "SELECT c.content FROM chunks c
             INNER JOIN documents d ON c.document_id = d.id
             WHERE d.notebook_id = ?1 AND d.status = 'processed'
             ORDER BY d.created_at, c.position
             LIMIT 20",
            )?;

            let rows: Vec<String> = stmt
                .query_map(rusqlite::params![&notebook_id], |row| {
                    row.get::<_, String>(0)
                })?
                .filter_map(|r| r.ok())
                .collect();
            rows
        };

        if chunks.is_empty() {
            return Err(AppError::InvalidInput(
                "No processed documents found. Import documents first.".into(),
            ));
        }

        let format = format.unwrap_or_else(|| "discussion".to_string());
        let (system_prompt, label) = match format.as_str() {
            "discussion" => (DISCUSSION_PROMPT, "Discussion"),
            "brief" => (BRIEF_PROMPT, "Brief"),
            "debate" => (DEBATE_PROMPT, "Debate"),
            "critique" => (CRITIQUE_PROMPT, "Critique"),
            "interview" => (INTERVIEW_PROMPT, "Interview"),
            "lecture" => (LECTURE_PROMPT, "Lecture"),
            "qanda" => (QANDA_PROMPT, "Questions"),
            other => {
                return Err(AppError::InvalidInput(format!(
                    "Unknown audio format: {other}"
                )));
            }
        };

        /* Document text goes inside <document_context> and is treated as data;
        the topic is a separate directive, matching the injection-safe pattern the
        Studio prompts use. */
        let joined = chunks.join("\n\n---\n\n");
        let context = crate::utils::text_utils::truncate_to_char_boundary(&joined, 4000);
        let directive = match topic.as_deref().map(str::trim) {
            Some(t) if !t.is_empty() => format!("Focus especially on: {t}"),
            _ => "Cover the key ideas across the documents.".to_string(),
        };
        let user_content =
            format!("<document_context>\n{context}\n</document_context>\n\n{directive}");

        let response = {
            let providers = app_state.provider_read()?;
            providers
                .chat_completion(ChatRequest {
                    messages: vec![
                        ChatMessage {
                            role: MessageRole::System,
                            content: system_prompt.to_string(),
                        },
                        ChatMessage {
                            role: MessageRole::User,
                            content: user_content,
                        },
                    ],
                    max_tokens: Some(2000),
                    temperature: Some(0.7),
                    purpose: TaskPurpose::Quality,
                })
                .map_err(|e| AppError::Provider(e.to_string()))?
        };

        let turns = parse_script(&response.content);

        if turns.is_empty() {
            return Err(AppError::Internal("LLM generated an empty script".into()));
        }

        let title = match topic.as_deref().map(str::trim) {
            Some(t) if !t.is_empty() => format!("{label}: {t}"),
            _ => label.to_string(),
        };
        Ok(PodcastScript { title, turns })
    })
    .await
    .map_err(|e| AppError::Internal(format!("Podcast task failed: {e}")))?
}

/// Parse LLM output into structured turns.
fn parse_script(text: &str) -> Vec<PodcastTurn> {
    let mut turns = Vec::new();

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let (speaker, content) = if let Some(rest) = line.strip_prefix("A:") {
            ("A", rest.trim())
        } else if let Some(rest) = line.strip_prefix("B:") {
            ("B", rest.trim())
        } else if let Some(rest) = line.strip_prefix("Speaker A:") {
            ("A", rest.trim())
        } else if let Some(rest) = line.strip_prefix("Speaker B:") {
            ("B", rest.trim())
        } else {
            continue;
        };

        if !content.is_empty() {
            turns.push(PodcastTurn {
                speaker: speaker.to_string(),
                text: content.to_string(),
            });
        }
    }

    turns
}
