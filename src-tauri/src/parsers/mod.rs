/*
 * Title: parsers/mod.rs
 * Tech Stack: Rust
 * Description: Document format parsers. Each parser extracts text from a file type.
 * Important Details: The parser_for_extension function returns the appropriate parser
 *   based on file extension. Adding a new format = create parser file + add to match.
 *   PDF and DOCX parsers will be added when their crate dependencies are integrated.
 */

pub mod markdown_parser;
pub mod plaintext_parser;
pub mod traits;

pub use traits::{DocumentParser, ParsedDocument, ParsedPage};

use crate::error::{AppError, AppResult};


/// Get the parser for a given file extension. Returns an error for unsupported formats.
pub fn parser_for_extension(ext: &str) -> AppResult<Box<dyn DocumentParser>> {
    match ext.to_lowercase().as_str() {
        "txt" | "text" => Ok(Box::new(plaintext_parser::PlaintextParser)),
        "md" | "markdown" => Ok(Box::new(markdown_parser::MarkdownParser)),
        other => Err(AppError::InvalidInput(format!(
            "Unsupported file format: .{other}"
        ))),
    }
}
