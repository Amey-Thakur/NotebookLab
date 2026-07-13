/*
 * Name: mod.rs
 * Purpose: Database model struct declarations.
 * Description: Each model maps to a database table. Models implement
 *   Serialize/Deserialize for Tauri IPC transmission.
 *   Create/Update structs use Option fields for partial updates.
 * Tech Stack: Rust, serde
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

pub mod canvas;
pub mod chunk;
pub mod conversation;
pub mod document;
pub mod note;
pub mod notebook;

pub use canvas::Canvas;
pub use chunk::{Chunk, CreateChunk};
pub use conversation::{Conversation, CreateConversation, Message};
pub use document::{CreateDocument, Document, DocumentStatus};
pub use note::{CreateNote, Note, UpdateNote};
pub use notebook::{CreateNotebook, Notebook, UpdateNotebook};
