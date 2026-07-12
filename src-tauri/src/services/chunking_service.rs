/*
 * Title: chunking_service.rs
 * Tech Stack: Rust
 * Description: Text chunking for RAG. Splits parsed document pages into overlapping
 *   chunks suitable for embedding and retrieval.
 * Important Details: Uses paragraph-aware splitting that respects sentence boundaries.
 *   Target ~400 tokens per chunk with 50-token overlap. Token count is approximated
 *   by word count * 1.3 (reasonable for English, conservative for CJK).
 */

use crate::database::models::CreateChunk;

const TARGET_TOKENS: usize = 400;
const OVERLAP_TOKENS: usize = 50;
const APPROX_TOKENS_PER_WORD: f32 = 1.3;

/// Split text into overlapping chunks with positional metadata.
pub fn chunk_text(
    document_id: &str,
    text: &str,
    page_number: Option<i32>,
    heading_context: &str,
) -> Vec<CreateChunk> {
    let paragraphs = split_into_paragraphs(text);
    let mut chunks = Vec::new();
    let mut current_text = String::new();
    let mut position = 0;

    for paragraph in &paragraphs {
        let combined_tokens = approx_token_count(&current_text) + approx_token_count(paragraph);

        if combined_tokens > TARGET_TOKENS && !current_text.is_empty() {
            /* Current buffer exceeds target, emit as a chunk */
            let token_count = approx_token_count(&current_text);

            chunks.push(CreateChunk {
                document_id: document_id.to_string(),
                content: current_text.trim().to_string(),
                position,
                page_number,
                heading_context: heading_context.to_string(),
                token_count: token_count as i32,
            });

            position += 1;

            /* Keep overlap from the end of the current chunk */
            current_text = get_overlap_text(&current_text, OVERLAP_TOKENS);
        }

        if !current_text.is_empty() && !paragraph.is_empty() {
            current_text.push_str("\n\n");
        }
        current_text.push_str(paragraph);
    }

    /* Emit remaining text as the final chunk */
    if !current_text.trim().is_empty() {
        let token_count = approx_token_count(&current_text);
        chunks.push(CreateChunk {
            document_id: document_id.to_string(),
            content: current_text.trim().to_string(),
            position,
            page_number,
            heading_context: heading_context.to_string(),
            token_count: token_count as i32,
        });
    }

    chunks
}

/// Split text into paragraphs (double newline separated).
fn split_into_paragraphs(text: &str) -> Vec<String> {
    text.split("\n\n")
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

/// Approximate token count from word count.
fn approx_token_count(text: &str) -> usize {
    let words = text.split_whitespace().count();
    (words as f32 * APPROX_TOKENS_PER_WORD) as usize
}

/// Extract the last N approximate tokens from text for chunk overlap.
fn get_overlap_text(text: &str, target_tokens: usize) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    let target_words = (target_tokens as f32 / APPROX_TOKENS_PER_WORD) as usize;

    if words.len() <= target_words {
        return text.to_string();
    }

    words[words.len() - target_words..].join(" ")
}
