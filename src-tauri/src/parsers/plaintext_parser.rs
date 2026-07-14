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
        let content = decode_text(bytes);

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

/// Decode file bytes to text, honoring a leading byte-order mark for UTF-8,
/// UTF-16LE, and UTF-16BE. Windows tools (Notepad's "Unicode" save) commonly
/// write UTF-16, which a plain UTF-8 decode would turn into garbage. Falls back
/// to UTF-8 with lossy replacement when there is no recognizable BOM. Shared
/// with the Markdown parser so both formats decode consistently.
pub(crate) fn decode_text(bytes: Vec<u8>) -> String {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(&bytes[3..]).into_owned();
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return decode_utf16(&bytes[2..], u16::from_le_bytes);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return decode_utf16(&bytes[2..], u16::from_be_bytes);
    }
    String::from_utf8(bytes).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

/// Decode a UTF-16 byte stream into a String using the given endianness. A
/// trailing odd byte, if any, is dropped.
fn decode_utf16(bytes: &[u8], to_u16: fn([u8; 2]) -> u16) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| to_u16([pair[0], pair[1]]))
        .collect();
    String::from_utf16_lossy(&units)
}

#[cfg(test)]
mod tests {
    use super::decode_text;

    #[test]
    fn decodes_plain_utf8() {
        assert_eq!(decode_text(b"Hello".to_vec()), "Hello");
    }

    #[test]
    fn strips_utf8_bom() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(b"Hi");
        assert_eq!(decode_text(bytes), "Hi");
    }

    #[test]
    fn decodes_utf16le_with_bom() {
        /* FF FE then "Hi" as little-endian UTF-16 */
        let bytes = vec![0xFF, 0xFE, 0x48, 0x00, 0x69, 0x00];
        assert_eq!(decode_text(bytes), "Hi");
    }

    #[test]
    fn decodes_utf16be_with_bom() {
        /* FE FF then "Hi" as big-endian UTF-16 */
        let bytes = vec![0xFE, 0xFF, 0x00, 0x48, 0x00, 0x69];
        assert_eq!(decode_text(bytes), "Hi");
    }
}
