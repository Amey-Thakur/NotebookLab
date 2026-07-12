/*
 * Title: first_run_service.rs
 * Tech Stack: Rust, rusqlite
 * Description: First-run experience. Creates a sample notebook with example notes
 *   so users get instant value without importing documents first.
 * Important Details: Gated on a settings-table flag rather than notebook count,
 *   so a user who deletes every notebook is respected instead of getting the
 *   sample recreated on the next launch. The two sample notes link to each
 *   other, so their wiki-links are re-synced after both rows exist.
 */

use rusqlite::Connection;

use crate::database::models::{CreateNote, CreateNotebook};
use crate::database::repository::{note_repository, notebook_repository};
use crate::error::AppResult;

const FIRST_RUN_FLAG: &str = "first_run_done";

/// Create a sample notebook on the very first launch.
pub fn ensure_sample_notebook(conn: &Connection) -> AppResult<()> {
    let already_done: bool = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            rusqlite::params![FIRST_RUN_FLAG],
            |row| row.get::<_, String>(0),
        )
        .map(|v| v == "true")
        .unwrap_or(false);

    if already_done {
        return Ok(());
    }

    tracing::info!("First run detected. Creating sample notebook...");

    let notebook = notebook_repository::create(
        conn,
        CreateNotebook {
            name: "Getting Started".to_string(),
            description: Some(
                "2 sample notes inside. Click to open, then click a note to read it.".to_string(),
            ),
            color: Some("#4A70A9".to_string()),
        },
    )?;

    let welcome = note_repository::create(
        conn,
        CreateNote {
            notebook_id: notebook.id.clone(),
            title: Some("Welcome to NotebookLab".to_string()),
            content: Some(
                r#"# Welcome to NotebookLab

Your thinking partner, on your machine.

## What you can do

- **Import documents** (PDF, TXT, Markdown) and ask questions about them
- **Write notes** with Markdown formatting and [[wiki-links]]
- **Chat with your documents** using AI-powered RAG (Retrieval-Augmented Generation)
- **Generate mind maps** from your research
- **Transform documents** (summarize, extract key points, custom prompts)

## Getting started

1. Go to **Models** in the sidebar and register an AI provider (Ollama is the easiest for local use)
2. Import a document using the notebook detail page
3. Open **Chat** and ask a question about your document
4. Try the **Thinking Partner** to generate mind maps or Socratic questions

## Wiki-links

You can link between notes using [[double brackets]]. Try linking to [[Research Notes]] below.

See the [[Research Notes]] for an example of how notes connect."#
                    .to_string(),
            ),
        },
    )?;

    note_repository::create(
        conn,
        CreateNote {
            notebook_id: notebook.id.clone(),
            title: Some("Research Notes".to_string()),
            content: Some(
                r#"# Research Notes

This is a sample note demonstrating how notes work in NotebookLab.

## Key Features

- **Bi-directional links**: This note is linked from [[Welcome to NotebookLab]]
- **Auto-save**: Your changes save automatically every 2 seconds
- **Markdown**: Full support for headings, lists, code blocks, and more

## Example Content

> "The best way to predict the future is to invent it." (Alan Kay)

### Code Example

```rust
fn main() {
    println!("Hello from NotebookLab!");
}
```

### Task List

- [x] Install NotebookLab
- [x] Open sample notebook
- [ ] Import your first document
- [ ] Try the AI chat
- [ ] Generate a mind map"#
                    .to_string(),
            ),
        },
    )?;

    /* The welcome note links to Research Notes, which did not exist when the
    welcome note was created. Re-sync so both directions resolve. */
    note_repository::sync_note_links(conn, &welcome.id, &notebook.id, &welcome.content)?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, 'true')",
        rusqlite::params![FIRST_RUN_FLAG],
    )?;

    tracing::info!("Sample notebook created with 2 notes");
    Ok(())
}
