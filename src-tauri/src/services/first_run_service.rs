/*
 * Name: first_run_service.rs
 * Purpose: First-run experience.
 * Description: Creates a sample notebook with example notes and a couple of
 *   short sample documents so a new user can try every feature (search, chat,
 *   the Studio, transforms, audio overview) without importing anything first.
 *   The documents are chunked through the real chunking service, so they behave
 *   exactly like imported files. Gated on a settings-table flag rather than
 *   notebook count, so a user who deletes every notebook is respected instead
 *   of getting the sample recreated on the next launch. The two sample notes
 *   link to each other, so their wiki-links are re-synced after both rows exist.
 * Tech Stack: Rust, rusqlite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

use rusqlite::Connection;
use sha2::{Digest, Sha256};

use crate::database::models::{CreateDocument, CreateNote, CreateNotebook, DocumentStatus};
use crate::database::repository::{
    chunk_repository, document_repository, note_repository, notebook_repository,
};
use crate::error::AppResult;
use crate::services::chunking_service;

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
                "Sample notes and documents to explore. Open Chat or the Studio and try them."
                    .to_string(),
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

    /* Seed a couple of short sample documents so search, chat, the Studio, and
    transforms all have real content to work on from the first launch. They are
    chunked through the same service imports use, so nothing about them is
    special downstream. */
    seed_sample_document(
        conn,
        &notebook.id,
        "A Brief History of the Internet",
        SAMPLE_INTERNET,
    )?;
    seed_sample_document(
        conn,
        &notebook.id,
        "The Basics of Photosynthesis",
        SAMPLE_PHOTOSYNTHESIS,
    )?;

    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, 'true')",
        rusqlite::params![FIRST_RUN_FLAG],
    )?;

    tracing::info!("Sample notebook created with 2 notes and 2 documents");
    Ok(())
}

/// Create a sample document from in-memory text, chunked exactly as an imported
/// file would be. No file is written; the stored path is a marker, since search
/// and chat read the chunks, not the original file.
fn seed_sample_document(
    conn: &Connection,
    notebook_id: &str,
    title: &str,
    content: &str,
) -> AppResult<()> {
    let file_hash = format!("{:x}", Sha256::digest(content.as_bytes()));

    let doc = document_repository::create(
        conn,
        CreateDocument {
            notebook_id: notebook_id.to_string(),
            title: title.to_string(),
            file_path: format!("sample://{title}"),
            file_type: "txt".to_string(),
            file_hash,
            file_size: content.len() as i64,
        },
    )?;

    document_repository::update_status(conn, &doc.id, DocumentStatus::Processing)?;
    let chunks = chunking_service::chunk_text(&doc.id, content, Some(1), "");
    chunk_repository::bulk_create(conn, chunks)?;
    document_repository::update_status(conn, &doc.id, DocumentStatus::Processed)?;

    Ok(())
}

const SAMPLE_INTERNET: &str = r#"A Brief History of the Internet

The internet began as a research project funded by the United States government in the late 1960s. Its first working network, called ARPANET, connected four university computers in 1969. The goal was to let researchers share scarce computing resources across long distances.

A key breakthrough came in the 1970s with packet switching and a common set of rules for exchanging data. In 1974, Vint Cerf and Bob Kahn described the Transmission Control Protocol and the Internet Protocol, known together as TCP/IP. On January 1, 1983, ARPANET switched to TCP/IP, a date many consider the true birth of the modern internet.

The 1980s saw the network grow beyond universities and military sites. The Domain Name System arrived in 1983, replacing hard to remember numeric addresses with names like example.com. By the end of the decade, national networks around the world were connecting to one another.

The World Wide Web changed everything. In 1989, Tim Berners-Lee, working at CERN in Switzerland, proposed a system of linked documents read through a browser. He released the first web browser and web server in 1991. The web made the internet approachable for ordinary people, not just engineers.

The 1990s brought rapid growth. Graphical browsers such as Mosaic and later Netscape Navigator let anyone click through pages of text and images. Businesses rushed online, and the number of websites grew from a handful to millions in only a few years.

Today the internet connects billions of devices and underpins commerce, communication, and culture. What started as a link between four computers is now a global system that most of the world relies on every day."#;

const SAMPLE_PHOTOSYNTHESIS: &str = r#"The Basics of Photosynthesis

Photosynthesis is the process that plants, algae, and some bacteria use to turn light into chemical energy. It is the foundation of almost every food chain on Earth and the source of most of the oxygen we breathe.

The process takes place mainly in the leaves, inside tiny structures called chloroplasts. Chloroplasts contain a green pigment named chlorophyll, which absorbs light most strongly in the red and blue parts of the spectrum and reflects green, which is why leaves look green.

Photosynthesis needs three ingredients: sunlight, water, and carbon dioxide. Roots draw water up from the soil, and small pores on the leaf called stomata let carbon dioxide in from the air. Using the energy in sunlight, the plant combines these into glucose, a simple sugar, and releases oxygen as a by-product.

Scientists divide the process into two stages. The light-dependent reactions capture energy from sunlight and store it in energy-carrying molecules. The light-independent reactions, also called the Calvin cycle, use that stored energy to build glucose from carbon dioxide.

The glucose a plant makes serves two purposes. Some is used right away for energy, and some is stored as starch for later or used to build the plant's structure. Animals, including humans, ultimately depend on this stored energy when they eat plants or eat other animals that ate plants.

Photosynthesis also shapes the whole planet. By taking in carbon dioxide and giving off oxygen, plants help regulate the atmosphere and the climate, making them essential far beyond the food they provide."#;
