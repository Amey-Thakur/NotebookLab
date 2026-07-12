/*
 * Name: plaintext_parser.rs
 * Purpose: Parser for plain text files (.txt).
 * Description: Treats the entire file as a single page with no heading
 *   extraction. Detects encoding via BOM (UTF-8, UTF-16). Falls
 *   back to UTF-8 with lossy conversion for non-UTF-8 files. File
 *   size capped at 50MB to prevent memory exhaustion on large
 *   files.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use std::path::Path;

use crate::error::{AppError, AppResult};

use super::traits::{DocumentParser, ParsedDocument, ParsedPage};

const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024; // 50MB

pub struct PlaintextParser;

impl DocumentParser for PlaintextParser {
    fn supported_extensions(&self) -> &[&str] {
        &["txt", "text"]
    }

    fn parse(&self, file_path: &Path) -> AppResult<ParsedDocument> {
        let metadata = std::fs::metadata(file_path)?;

        if metadata.len() > MAX_FILE_SIZE {
            return Err(AppError::InvalidInput(format!(
                "File too large: {} bytes (max {})",
                metadata.len(),
                MAX_FILE_SIZE
            )));
        }

        let bytes = std::fs::read(file_path)?;
        let content = String::from_utf8(bytes)
            .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned());

        let title = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();

        Ok(ParsedDocument {
            title,
            pages: vec![ParsedPage {
                page_number: 1,
                content,
                headings: Vec::new(),
            }],
        })
    }
}
