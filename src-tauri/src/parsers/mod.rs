/*
 * Name: mod.rs
 * Purpose: Document format parsers.
 * Description: Each parser extracts text from a file type. The
 *   parser_for_extension function returns the appropriate parser
 *   based on file extension. Adding a new format = create parser
 *   file + add to match. PDF and DOCX parsers will be added when
 *   their crate dependencies are integrated.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

pub mod markdown_parser;
pub mod pdf_parser;
pub mod plaintext_parser;
pub mod traits;

#[allow(unused_imports)]
pub use traits::{DocumentParser, ParsedDocument, ParsedPage};

use crate::error::{AppError, AppResult};

/// Get the parser for a given file extension. Returns an error for unsupported formats.
pub fn parser_for_extension(ext: &str) -> AppResult<Box<dyn DocumentParser>> {
    match ext.to_lowercase().as_str() {
        "txt" | "text" => Ok(Box::new(plaintext_parser::PlaintextParser)),
        "md" | "markdown" => Ok(Box::new(markdown_parser::MarkdownParser)),
        "pdf" => Ok(Box::new(pdf_parser::PdfParser)),
        other => Err(AppError::InvalidInput(format!(
            "Unsupported file format: .{other}"
        ))),
    }
}
