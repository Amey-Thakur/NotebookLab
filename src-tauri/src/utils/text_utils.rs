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
