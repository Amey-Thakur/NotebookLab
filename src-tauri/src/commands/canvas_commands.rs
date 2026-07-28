/*
 * Name: canvas_commands.rs
 * Purpose: Tauri commands for the notebook canvas.
 * Description: Two small, synchronous commands: open (get or create) a
 *   notebook's canvas, and save its scene. Saving is capped so
 *   embedded images cannot grow the database without bound. The
 *   scene is opaque JSON owned by the frontend.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

use tauri::State;

use crate::database::models::Canvas;
use crate::database::repository::canvas_repository;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// Cap the stored scene so embedded images cannot grow the database without
/// bound. Generous, but a real ceiling.
const MAX_SCENE_BYTES: usize = 48 * 1024 * 1024;

#[tauri::command(rename_all = "snake_case")]
pub fn get_or_create_canvas(state: State<'_, AppState>, notebook_id: String) -> AppResult<Canvas> {
    let conn = state.conn()?;
    canvas_repository::get_or_create(&conn, &notebook_id)
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_canvas(state: State<'_, AppState>, id: String, scene: String) -> AppResult<Canvas> {
    if scene.len() > MAX_SCENE_BYTES {
        return Err(AppError::InvalidInput(
            "This canvas is too large to save. Try using fewer or smaller images.".into(),
        ));
    }

    let conn = state.conn()?;
    canvas_repository::update_scene(&conn, &id, &scene)
}

/// Image types the canvas will accept from a drop.
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp"];

/// Refuse anything larger than this before reading it. The canvas re-encodes
/// what it receives down to a bounded JPEG, so a huge original buys nothing and
/// would cross the IPC boundary base64-encoded, at four bytes for every three.
const MAX_IMAGE_BYTES: u64 = 24 * 1024 * 1024;

/// Read an image from disk as a `data:` URL the webview can load.
///
/// Dropping a file onto the window now goes through Tauri's own drag-and-drop,
/// which hands over a real path rather than a browser `File`. The canvas needs
/// bytes to draw, and the alternative, exposing the asset protocol, would let
/// the webview read any file inside its scope. A single command that only ever
/// serves image files, with an extension allowlist and a size ceiling, is a far
/// smaller surface for the same result.
#[tauri::command(rename_all = "snake_case")]
pub fn read_image_data_url(path: String) -> AppResult<String> {
    let file = std::path::Path::new(&path);

    let extension = file
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(AppError::InvalidInput(format!(
            "{extension} is not an image type the canvas can place."
        )));
    }

    let size = std::fs::metadata(file)
        .map_err(|e| AppError::InvalidInput(format!("Could not read that file: {e}")))?
        .len();
    if size > MAX_IMAGE_BYTES {
        return Err(AppError::InvalidInput(format!(
            "That image is {} MB. The limit is {} MB.",
            size / 1_048_576,
            MAX_IMAGE_BYTES / 1_048_576
        )));
    }

    let bytes = std::fs::read(file)
        .map_err(|e| AppError::InvalidInput(format!("Could not read that file: {e}")))?;

    /* jpg and jpeg are the same media type; everything else in the allowlist
    matches its extension. */
    let mime = if extension == "jpg" {
        "jpeg"
    } else {
        &extension
    };
    Ok(format!(
        "data:image/{mime};base64,{}",
        base64_encode(&bytes)
    ))
}

/// Standard base64, without pulling in a dependency for one call site.
fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod image_tests {
    use super::*;

    #[test]
    fn base64_matches_known_vectors() {
        /* The RFC 4648 test vectors, so the padding cases are covered rather
        than assumed: they are where a hand-rolled encoder goes wrong. */
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn base64_handles_high_bytes() {
        assert_eq!(base64_encode(&[0xff, 0xfe, 0xfd]), "//79");
        assert_eq!(base64_encode(&[0x00, 0x00, 0x00]), "AAAA");
    }

    #[test]
    fn non_image_extensions_are_refused() {
        let err = read_image_data_url("notes.pdf".to_string()).unwrap_err();
        assert!(err.to_string().contains("not an image type"));
    }

    #[test]
    fn a_missing_extension_is_refused() {
        let err = read_image_data_url("README".to_string()).unwrap_err();
        assert!(err.to_string().contains("not an image type"));
    }
}
