/*
 * Title: commands/mod.rs
 * Tech Stack: Rust
 * Description: Module declarations for all Tauri command handler groups.
 * Important Details: Each command file is a separate module for isolation.
 *   Adding a new feature's commands = add one mod line here + register in lib.rs.
 */

pub mod chat_commands;
pub mod document_commands;
pub mod download_commands;
pub mod model_commands;
pub mod note_commands;
pub mod notebook_commands;
pub mod search_commands;
pub mod sidecar_commands;
pub mod system_commands;
pub mod thinking_commands;
pub mod transform_commands;
