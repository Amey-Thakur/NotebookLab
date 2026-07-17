/*
 * Name: mod.rs
 * Purpose: Document format parsers.
 * Description: Each parser extracts text from a file type. The
 *   parser_for_extension function returns the appropriate parser
 *   based on file extension. Adding a new format = create parser
 *   file + add to match. Plain text, Markdown, PDF, and Word (.docx)
 *   are read directly; images are read with offline OCR, which needs
 *   the OCR engine passed in (it is unavailable when the models are
 *   not installed, and image import degrades to a clear error then).
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

pub mod docx_parser;
pub mod image_ocr_parser;
pub mod markdown_parser;
pub mod pdf_parser;
pub mod plaintext_parser;
pub mod traits;

#[allow(unused_imports)]
pub use traits::{DocumentParser, ParsedDocument, ParsedPage};

use std::sync::Arc;

use crate::error::{AppError, AppResult};
use image_ocr_parser::{ImageOcrParser, OcrEngineHandle};

/// Get the parser for a given file extension. Returns an error for unsupported
/// formats.
///
/// Image formats are read with OCR and need the shared engine; when it is not
/// available (models not installed) they return a clear error instead of a
/// parser, so import stays fully usable for every other format.
pub fn parser_for_extension(
    ext: &str,
    ocr: Option<&Arc<OcrEngineHandle>>,
) -> AppResult<Box<dyn DocumentParser>> {
    match ext.to_lowercase().as_str() {
        "txt" | "text" => Ok(Box::new(plaintext_parser::PlaintextParser)),
        "md" | "markdown" => Ok(Box::new(markdown_parser::MarkdownParser)),
        "pdf" => Ok(Box::new(pdf_parser::PdfParser)),
        "docx" => Ok(Box::new(docx_parser::DocxParser)),
        image if is_ocr_image_extension(image) => match ocr {
            Some(engine) => Ok(Box::new(ImageOcrParser::new(engine.clone()))),
            None => Err(AppError::InvalidInput(
                "Image import is unavailable because the OCR models are not installed.".into(),
            )),
        },
        other => Err(AppError::InvalidInput(format!(
            "Unsupported file format: .{other}"
        ))),
    }
}

/// Whether a file extension is an image read with OCR. Kept as the single source
/// of truth so the import command only builds the OCR engine for these formats
/// and text formats never pay for loading the models.
pub fn is_ocr_image_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "tiff" | "tif" | "webp" | "bmp"
    )
}

/// Whether a file extension has a parser at all. Used by the "Open with
/// NotebookLab" path to accept only files the import pipeline can read.
pub fn is_supported_extension(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "txt" | "text" | "md" | "markdown" | "pdf" | "docx"
    ) || is_ocr_image_extension(ext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dispatches_text_formats_without_ocr() {
        for ext in [
            "txt", "text", "md", "markdown", "pdf", "docx", "TXT", "Docx",
        ] {
            assert!(
                parser_for_extension(ext, None).is_ok(),
                "{ext} should dispatch a parser without the OCR engine"
            );
        }
    }

    #[test]
    fn image_formats_need_the_ocr_engine() {
        for ext in ["png", "jpg", "jpeg", "tiff", "tif", "webp", "bmp"] {
            assert!(
                matches!(
                    parser_for_extension(ext, None),
                    Err(AppError::InvalidInput(_))
                ),
                "{ext} without the engine should be an unavailable error, not a panic"
            );
        }
    }

    #[test]
    fn rejects_unsupported_formats() {
        assert!(matches!(
            parser_for_extension("xyz", None),
            Err(AppError::InvalidInput(_))
        ));
    }
}
