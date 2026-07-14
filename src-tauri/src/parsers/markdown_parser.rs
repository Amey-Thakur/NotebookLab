/*
 * Name: markdown_parser.rs
 * Purpose: Parser for Markdown files (.md, .markdown).
 * Description: Extracts headings as structural metadata for chunk
 *   heading_context during ingestion. Uses simple line-based
 *   parsing (not a full AST parser) because the goal is text
 *   extraction, not rendering. Headings are detected by leading #
 *   characters. Frontmatter (between --- delimiters) is stripped.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use std::path::Path;

use crate::error::{AppError, AppResult};

use super::traits::{DocumentParser, ParsedDocument, ParsedPage};

const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;

pub struct MarkdownParser;

impl DocumentParser for MarkdownParser {
    fn parse(&self, file_path: &Path) -> AppResult<ParsedDocument> {
        /* Check size BEFORE reading to prevent memory exhaustion */
        let metadata = std::fs::metadata(file_path)?;

        if metadata.len() > MAX_FILE_SIZE {
            return Err(AppError::InvalidInput(format!(
                "File too large: {} bytes (max {})",
                metadata.len(),
                MAX_FILE_SIZE
            )));
        }

        /* Decode through the shared byte-order-mark aware decoder so a
        Windows-authored UTF-8-BOM or UTF-16 .md file behaves like the same
        content saved as .txt, rather than keeping a stray BOM (which breaks
        frontmatter and heading detection) or failing to read outright. */
        let raw = super::plaintext_parser::decode_text(std::fs::read(file_path)?);
        let content = strip_frontmatter(&raw);
        let headings = extract_headings(&content);

        let title = headings.first().cloned().unwrap_or_else(|| {
            file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string()
        });

        Ok(ParsedDocument {
            title,
            pages: vec![ParsedPage {
                page_number: 1,
                content,
                headings,
            }],
        })
    }
}

/// Remove YAML frontmatter (content between opening and closing --- lines).
fn strip_frontmatter(text: &str) -> String {
    let trimmed = text.trim_start();

    if !trimmed.starts_with("---") {
        return text.to_string();
    }

    /* Find the closing --- after the opening one */
    if let Some(end) = trimmed[3..].find("\n---") {
        let after_frontmatter = &trimmed[3 + end + 4..];
        after_frontmatter.trim_start().to_string()
    } else {
        text.to_string()
    }
}

/// Extract Markdown headings (lines starting with #).
fn extract_headings(text: &str) -> Vec<String> {
    text.lines()
        .filter(|line| line.starts_with('#'))
        .map(|line| line.trim_start_matches('#').trim().to_string())
        .filter(|h| !h.is_empty())
        .collect()
}
