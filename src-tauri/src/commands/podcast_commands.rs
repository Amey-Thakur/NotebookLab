/*
 * Title: podcast_commands.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri commands for AI podcast script generation. Uses the active LLM
 *   provider to generate a 2-speaker discussion script from document context.
 * Important Details: The Rust backend handles script generation only. Audio synthesis
 *   is handled by the frontend using the browser's SpeechSynthesis API (offline,
 *   cross-platform, zero-config). This can be upgraded to Piper/Kokoro TTS later
 *   for higher quality voices.
 */

use tauri::Manager;

use crate::error::{AppError, AppResult};
use crate::providers::traits::{ChatMessage, ChatRequest, MessageRole};
use crate::state::AppState;

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

        let context = chunks.join("\n\n---\n\n");
        let topic_str = topic.unwrap_or_else(|| "the key ideas in these documents".to_string());

        /* Generate script via LLM */
        let prompt = format!(
            "Create a natural podcast conversation between two speakers (A and B) about {}.\n\n\
         Source material:\n{}\n\n\
         Rules:\n\
         - Write 8-12 turns\n\
         - Speaker A asks questions and makes observations\n\
         - Speaker B explains and provides insights\n\
         - Keep each turn to 2-3 sentences, conversational tone\n\
         - Start with a brief intro, end with a wrap-up\n\n\
         Format each line as:\nA: [text]\nB: [text]\n\nOutput ONLY the dialogue.",
            topic_str,
            crate::utils::text_utils::truncate_to_char_boundary(&context, 4000)
        );

        let response = {
            let providers = app_state.provider_read()?;
            providers
                .chat_completion(ChatRequest {
                    messages: vec![
                        ChatMessage {
                            role: MessageRole::System,
                            content: "You write podcast scripts as natural dialogue.".into(),
                        },
                        ChatMessage {
                            role: MessageRole::User,
                            content: prompt,
                        },
                    ],
                    max_tokens: Some(2000),
                    temperature: Some(0.7),
                })
                .map_err(|e| AppError::Provider(e.to_string()))?
        };

        let turns = parse_script(&response.content);

        if turns.is_empty() {
            return Err(AppError::Internal("LLM generated an empty script".into()));
        }

        Ok(PodcastScript {
            title: format!("Podcast: {}", topic_str),
            turns,
        })
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
