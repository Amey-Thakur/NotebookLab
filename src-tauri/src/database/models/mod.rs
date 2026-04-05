/*
 * Title: database/models/mod.rs
 * Tech Stack: Rust, serde
 * Description: Database model struct declarations. Each model maps to a database table.
 * Important Details: Models implement Serialize/Deserialize for Tauri IPC transmission.
 *   Create/Update structs use Option fields for partial updates.
 */

pub mod chunk;
pub mod document;
pub mod note;
pub mod notebook;

pub use chunk::{Chunk, CreateChunk};
pub use document::{CreateDocument, Document, DocumentStatus};
pub use note::{CreateNote, Note, UpdateNote};
pub use notebook::{CreateNotebook, Notebook, UpdateNotebook};
