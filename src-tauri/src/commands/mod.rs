/*
 * Name: mod.rs
 * Purpose: Module declarations for all Tauri command handler groups.
 * Description: Each command file is a separate module for isolation. Adding a
 *   new feature's commands = add one mod line here + register in
 *   lib.rs.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

pub mod canvas_commands;
pub mod chat_commands;
pub mod document_commands;
pub mod download_commands;
pub mod model_commands;
pub mod note_commands;
pub mod notebook_commands;
pub mod ollama_commands;
pub mod podcast_commands;
pub mod prompt_commands;
pub mod search_commands;
pub mod share_commands;
pub mod sidecar_commands;
pub mod studio_commands;
pub mod system_commands;
pub mod thinking_commands;
pub mod transform_commands;
