/*
 * Title: text_utils.rs
 * Tech Stack: Rust
 * Description: Text processing utilities shared across services and repositories.
 * Important Details: LIKE pattern escaping prevents metacharacters in user input
 *   from being interpreted as SQL wildcards.
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
