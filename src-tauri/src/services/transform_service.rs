/*
 * Title: transform_service.rs
 * Tech Stack: Rust
 * Description: Content transformation service. Applies AI-powered transformations
 *   to document text: summarize, extract key points, or custom prompts.
 * Important Details: Transformations operate on a single document's chunks, not
 *   the full notebook. The transformation type determines the system prompt behavior.
 */

use rusqlite::Connection;

use crate::database::repository::chunk_repository;
use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole, ProviderRouter};


const TRANSFORM_PROMPT: &str = include_str!("../../resources/prompts/content-transform.txt");


#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransformType {
    Summarize,
    ExtractKeyPoints,
    Custom,
}

impl TransformType {
    fn instruction(&self, custom_prompt: Option<&str>) -> String {
        match self {
            Self::Summarize => "Transformation: SUMMARIZE".to_string(),
            Self::ExtractKeyPoints => "Transformation: EXTRACT_KEY_POINTS".to_string(),
            Self::Custom => {
                let prompt = custom_prompt.unwrap_or("Analyze this text.");
                format!("Transformation: CUSTOM\nUser instruction: {prompt}")
            }
        }
    }
}


/// Apply a transformation to a document's content.
pub fn transform_document(
    conn: &Connection,
    providers: &ProviderRouter,
    document_id: &str,
    transform_type: TransformType,
    custom_prompt: Option<&str>,
) -> AppResult<String> {
    let chunks = chunk_repository::get_by_document(conn, document_id)?;

    if chunks.is_empty() {
        return Err(AppError::InvalidInput(
            "Document has no content to transform. It may still be processing.".into(),
        ));
    }

    /* Concatenate chunks into full document text (capped at ~8000 tokens) */
    let mut text = String::new();
    let mut token_estimate = 0;
    for chunk in &chunks {
        if token_estimate > 8000 {
            break;
        }
        if !text.is_empty() {
            text.push_str("\n\n");
        }
        text.push_str(&chunk.content);
        token_estimate += chunk.token_count as usize;
    }

    let instruction = transform_type.instruction(custom_prompt);

    let messages = vec![
        ChatMessage {
            role: MessageRole::System,
            content: TRANSFORM_PROMPT.to_string(),
        },
        ChatMessage {
            role: MessageRole::User,
            content: format!("{instruction}\n\n<document_text>\n{text}\n</document_text>"),
        },
    ];

    let response = providers
        .chat_completion(ChatRequest {
            messages,
            max_tokens: Some(2048),
            temperature: Some(0.3),
        })
        .map_err(|e| AppError::Provider(e.to_string()))?;

    Ok(response.content)
}
