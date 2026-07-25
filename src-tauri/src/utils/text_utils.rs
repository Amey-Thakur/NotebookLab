/*
 * Name: text_utils.rs
 * Purpose: Text processing utilities shared across services and repositories.
 * Description: LIKE pattern escaping prevents metacharacters in user input
 *   from being interpreted as SQL wildcards.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

/// Escape SQL LIKE metacharacters in user input for safe pattern matching.
/// Returns a pattern wrapped in % for substring search.
pub fn escape_like_pattern(query: &str) -> String {
    let escaped = query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");

    format!("%{escaped}%")
}

/// Strip a leading `<think>...</think>` block from model output.
/// Reasoning models (DeepSeek R1, Qwen with thinking on) emit their hidden
/// chain of thought before the answer; showing it verbatim buries the answer
/// under minutes of monologue. Only a closed leading block with a non-empty
/// answer after it is stripped: an unclosed block (output cut off mid-think)
/// or a think-only reply is returned unchanged, so the user always sees
/// something rather than an empty message.
pub fn strip_reasoning_block(content: &str) -> &str {
    let trimmed = content.trim_start();
    let Some(rest) = trimmed.strip_prefix("<think>") else {
        return content;
    };
    match rest.find("</think>") {
        Some(position) => {
            let answer = rest[position + "</think>".len()..].trim();
            if answer.is_empty() {
                content
            } else {
                answer
            }
        }
        None => content,
    }
}

/// Truncate a string to at most `max_bytes` without splitting a UTF-8 character.
/// Byte-index slicing panics on multi-byte boundaries; this walks back to the
/// nearest valid boundary instead.
pub fn truncate_to_char_boundary(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_reasoning_removes_closed_leading_block() {
        let output = "<think>Let me work through this...</think>\n\nThe answer is 4.";
        assert_eq!(strip_reasoning_block(output), "The answer is 4.");
    }

    #[test]
    fn strip_reasoning_leaves_plain_output_unchanged() {
        assert_eq!(
            strip_reasoning_block("The answer is 4."),
            "The answer is 4."
        );
        /* A think tag mid-text is content, not a reasoning preamble. */
        let mid = "The tag <think> appears in HTML-like text.";
        assert_eq!(strip_reasoning_block(mid), mid);
    }

    #[test]
    fn strip_reasoning_keeps_unclosed_block() {
        /* Output cut off mid-think: better the partial monologue than nothing. */
        let cut = "<think>Still reasoning about";
        assert_eq!(strip_reasoning_block(cut), cut);
    }

    #[test]
    fn strip_reasoning_keeps_think_only_reply() {
        let only = "<think>All thought, no answer.</think>";
        assert_eq!(strip_reasoning_block(only), only);
        let whitespace_after = "<think>thought</think>   \n ";
        assert_eq!(strip_reasoning_block(whitespace_after), whitespace_after);
    }

    #[test]
    fn strip_reasoning_tolerates_leading_whitespace() {
        let output = "\n  <think>hmm</think>Answer.";
        assert_eq!(strip_reasoning_block(output), "Answer.");
    }

    #[test]
    fn truncate_ascii_at_limit() {
        assert_eq!(truncate_to_char_boundary("hello", 5), "hello");
        assert_eq!(truncate_to_char_boundary("hello", 3), "hel");
    }

    #[test]
    fn truncate_shorter_than_limit_is_unchanged() {
        assert_eq!(truncate_to_char_boundary("hi", 100), "hi");
    }

    #[test]
    fn truncate_never_splits_multibyte_chars() {
        /* Each e-acute is 2 bytes; slicing at byte 3 would panic with [..3] */
        let text = "\u{e9}\u{e9}\u{e9}";
        let cut = truncate_to_char_boundary(text, 3);
        assert_eq!(cut, "\u{e9}");
        assert!(text.is_char_boundary(cut.len()));
    }

    #[test]
    fn truncate_at_zero_returns_empty() {
        assert_eq!(truncate_to_char_boundary("data", 0), "");
    }
}
