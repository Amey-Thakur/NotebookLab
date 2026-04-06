/*
 * Title: pdf_parser.rs
 * Tech Stack: Rust, pdf-extract
 * Description: Parser for PDF files. Extracts text content page-by-page with
 *   heading detection for chunk metadata.
 * Important Details: Uses pdf-extract for text extraction. Falls back gracefully
 *   on encrypted or image-only PDFs with a clear error message. File size capped
 *   at 50MB to prevent memory exhaustion.
 */

use std::path::Path;

use crate::error::{AppError, AppResult};

use super::traits::{DocumentParser, ParsedDocument, ParsedPage};


const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;


pub struct PdfParser;


impl DocumentParser for PdfParser {
    fn supported_extensions(&self) -> &[&str] {
        &["pdf"]
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

        let text = pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| AppError::InvalidInput(format!(
                "Could not extract text from PDF: {e}. The file may be encrypted or image-only."
            )))?;

        if text.trim().is_empty() {
            return Err(AppError::InvalidInput(
                "PDF contains no extractable text. It may be a scanned document (OCR not yet supported).".into(),
            ));
        }

        let title = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();

        /* Split by form feed characters (page breaks) if present */
        let raw_pages: Vec<&str> = text.split('\u{000C}').collect();

        let pages: Vec<ParsedPage> = if raw_pages.len() > 1 {
            raw_pages
                .iter()
                .enumerate()
                .filter(|(_, p)| !p.trim().is_empty())
                .map(|(i, page_text)| {
                    let headings = extract_likely_headings(page_text);
                    ParsedPage {
                        page_number: (i + 1) as i32,
                        content: page_text.trim().to_string(),
                        headings,
                    }
                })
                .collect()
        } else {
            /* No page breaks detected, treat as single page */
            let headings = extract_likely_headings(&text);
            vec![ParsedPage {
                page_number: 1,
                content: text.trim().to_string(),
                headings,
            }]
        };

        Ok(ParsedDocument { title, pages })
    }
}


/// Heuristic heading detection for PDF text.
/// Lines that are short, start with a capital letter, and are followed by
/// longer lines are likely headings.
fn extract_likely_headings(text: &str) -> Vec<String> {
    text.lines()
        .filter(|line| {
            let trimmed = line.trim();
            trimmed.len() > 2
                && trimmed.len() < 100
                && trimmed.chars().next().map(|c| c.is_uppercase()).unwrap_or(false)
                && !trimmed.ends_with('.')
                && !trimmed.ends_with(',')
        })
        .take(10)
        .map(|s| s.trim().to_string())
        .collect()
}
