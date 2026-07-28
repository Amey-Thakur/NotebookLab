/*
 * Name: chunking_service.rs
 * Purpose: Text chunking for RAG.
 * Description: Splits parsed document pages into overlapping chunks suitable
 *   for embedding and retrieval. Uses paragraph-aware splitting
 *   that respects sentence boundaries. Target ~400 tokens per
 *   chunk with 50-token overlap. Token count is approximated by
 *   word count * 1.3 (reasonable for English, conservative for
 *   CJK).
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
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
        .flat_map(|p| split_oversized(&p))
        .collect()
}

/// Break a paragraph that is on its own larger than a chunk.
///
/// Splitting on blank lines alone assumes documents have them. A minified JSON
/// dump, a single-line log, or an export with no paragraph breaks arrives as
/// one paragraph, and the chunk loop only emits when the buffer is non-empty,
/// so that whole file became a single chunk. A 50 MB chunk is a 50 MB row for
/// FTS5 to index and, worse, a 50 MB body sent to whichever provider is active.
///
/// Sentences first, since they keep meaning intact; then words, for text that
/// has no sentence endings either.
fn split_oversized(paragraph: &str) -> Vec<String> {
    if approx_token_count(paragraph) <= TARGET_TOKENS {
        return vec![paragraph.to_string()];
    }

    let mut out = Vec::new();
    let mut buf = String::new();
    for sentence in paragraph.split_inclusive(['.', '!', '?', '\n']) {
        if !buf.is_empty()
            && approx_token_count(&buf) + approx_token_count(sentence) > TARGET_TOKENS
        {
            out.push(std::mem::take(&mut buf).trim().to_string());
        }
        /* A single sentence can still exceed the target, so fall back to words
        rather than emitting something unbounded. */
        if approx_token_count(sentence) > TARGET_TOKENS {
            for word in sentence.split_whitespace() {
                if approx_token_count(&buf) + approx_token_count(word) > TARGET_TOKENS
                    && !buf.is_empty()
                {
                    out.push(std::mem::take(&mut buf).trim().to_string());
                }
                if !buf.is_empty() {
                    buf.push(' ');
                }
                buf.push_str(word);
            }
        } else {
            buf.push_str(sentence);
        }
    }
    if !buf.trim().is_empty() {
        out.push(buf.trim().to_string());
    }
    out.retain(|p| !p.is_empty());
    out
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

#[cfg(test)]
mod tests {
    use super::*;

    /// No chunk should ever be wildly larger than the target. The bound is
    /// generous because the overlap and the final paragraph can push a chunk
    /// past the target legitimately; what it catches is a runaway.
    fn assert_bounded(chunks: &[CreateChunk]) {
        for c in chunks {
            let n = approx_token_count(&c.content);
            assert!(
                n <= TARGET_TOKENS * 2,
                "chunk of {n} tokens is unbounded (target {TARGET_TOKENS})"
            );
        }
    }

    #[test]
    fn a_file_with_no_blank_line_still_chunks() {
        /* The failing shape. Splitting on "\n\n" alone found one paragraph,
        and the loop only emits when the buffer is non-empty, so the entire
        file became a single chunk. */
        let text = "word ".repeat(TARGET_TOKENS * 6);
        let chunks = chunk_text("doc", &text, None, "");
        assert!(
            chunks.len() > 1,
            "expected several chunks, got {}",
            chunks.len()
        );
        assert_bounded(&chunks);
    }

    #[test]
    fn one_enormous_sentence_is_still_bounded() {
        /* Minified JSON and single-line logs: no sentence endings at all, so
        the word fallback is the only thing that can break this up. */
        let text = format!("{{\"k\":\"{}\"}}", "v ".repeat(TARGET_TOKENS * 4));
        let chunks = chunk_text("doc", &text, None, "");
        assert!(chunks.len() > 1);
        assert_bounded(&chunks);
    }

    #[test]
    fn sentences_are_preferred_over_words() {
        let sentence = format!("{}. ", "word ".repeat(60));
        let chunks = chunk_text("doc", &sentence.repeat(12), None, "");
        assert!(chunks.len() > 1);
        assert_bounded(&chunks);
        /* Splitting on sentence ends keeps the period attached, so a chunk
        should not begin mid-sentence with a bare fragment. */
        assert!(chunks[0].content.contains('.'));
    }

    #[test]
    fn ordinary_prose_is_untouched() {
        let text = "First para.\n\nSecond para.\n\nThird para.";
        let chunks = chunk_text("doc", text, None, "");
        assert_eq!(chunks.len(), 1, "short prose still fits in one chunk");
        assert!(chunks[0].content.contains("First para."));
        assert!(chunks[0].content.contains("Third para."));
    }

    #[test]
    fn empty_input_produces_nothing() {
        assert!(chunk_text("doc", "", None, "").is_empty());
        assert!(chunk_text("doc", "   \n\n  \n\n ", None, "").is_empty());
    }

    #[test]
    fn positions_are_sequential() {
        let text = "word ".repeat(TARGET_TOKENS * 5);
        let chunks = chunk_text("doc", &text, None, "");
        for (i, c) in chunks.iter().enumerate() {
            assert_eq!(c.position, i as i32, "positions must be 0..n");
        }
    }
}
