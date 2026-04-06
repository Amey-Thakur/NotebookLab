/*
 * Title: traits.rs
 * Tech Stack: Rust
 * Description: Parser trait that all document format parsers must implement.
 * Important Details: Each parser extracts text from a file and returns structured
 *   output with positional metadata (page numbers, headings). Parsers are stateless
 *   and operate on file paths. Adding a new format = implement this trait + register.
 */

use crate::error::AppResult;


/// Output of a document parser. Contains the extracted text with metadata.
#[derive(Debug, Clone)]
pub struct ParsedDocument {
    pub title: String,
    pub pages: Vec<ParsedPage>,
}


/// A logical page of extracted text.
#[derive(Debug, Clone)]
pub struct ParsedPage {
    pub page_number: i32,
    pub content: String,
    pub headings: Vec<String>,
}


/// Every document parser implements this trait.
pub trait DocumentParser: Send + Sync {
    /// File extensions this parser handles (e.g., ["txt", "text"]).
    fn supported_extensions(&self) -> &[&str];

    /// Parse a file at the given path and return structured text output.
    fn parse(&self, file_path: &std::path::Path) -> AppResult<ParsedDocument>;
}
