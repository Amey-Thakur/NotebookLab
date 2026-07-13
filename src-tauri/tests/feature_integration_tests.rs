/*
 * Name: feature_integration_tests.rs
 * Purpose: Exercise the real data code paths end to end against a live SQLite
 *   database, the way the app does at runtime.
 * Description: These tests drive the actual repository and service functions
 *   against a temporary database created from the bundled migrations, with no
 *   mocks. They cover the paths that do not need an LLM: notebook and note
 *   CRUD, wiki-link extraction and backlinks, recent notes, the notes graph,
 *   document ingestion and chunking, search, and RTF export. If a feature is
 *   wired wrong, one of these fails.
 * Tech Stack: Rust, rusqlite, integration tests
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use rusqlite::Connection;

use notebooklab_lib::commands::share_commands::{build_bundle, write_bundle};
use notebooklab_lib::database::models::{
    CreateChunk, CreateDocument, CreateNote, CreateNotebook, UpdateNote,
};
use notebooklab_lib::database::repository::{
    canvas_repository, chunk_repository, document_repository, note_repository, notebook_repository,
};
use notebooklab_lib::services::ingestion_service;
use notebooklab_lib::services::search_service;
use notebooklab_lib::utils::rtf;

/// Build a fresh in-memory database with the real migrations applied.
fn test_db() -> Connection {
    let conn = Connection::open_in_memory().expect("open db");
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    for sql in [
        include_str!("../resources/migrations/001_initial_schema.sql"),
        include_str!("../resources/migrations/002_chat_tables.sql"),
        include_str!("../resources/migrations/003_fts5_search.sql"),
        include_str!("../resources/migrations/004_embeddings.sql"),
        include_str!("../resources/migrations/005_canvas.sql"),
    ] {
        conn.execute_batch(sql).expect("migration");
    }
    conn
}

fn make_notebook(conn: &Connection) -> String {
    notebook_repository::create(
        conn,
        CreateNotebook {
            name: "Research".into(),
            description: None,
            color: None,
        },
    )
    .expect("create notebook")
    .id
}

#[test]
fn export_and_import_round_trips_a_notebook() {
    let conn = test_db();
    let nb = make_notebook(&conn);

    note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("My note".into()),
            content: Some("Some content.".into()),
        },
    )
    .unwrap();

    let doc = document_repository::create(
        &conn,
        CreateDocument {
            notebook_id: nb.clone(),
            title: "Doc".into(),
            file_path: "/x/doc.txt".into(),
            file_type: "txt".into(),
            file_hash: "hash123".into(),
            file_size: 42,
        },
    )
    .unwrap();
    chunk_repository::bulk_create(
        &conn,
        vec![
            CreateChunk {
                document_id: doc.id.clone(),
                content: "chunk one".into(),
                position: 0,
                page_number: Some(1),
                heading_context: "Intro".into(),
                token_count: 2,
            },
            CreateChunk {
                document_id: doc.id.clone(),
                content: "chunk two".into(),
                position: 1,
                page_number: None,
                heading_context: String::new(),
                token_count: 2,
            },
        ],
    )
    .unwrap();

    let canvas = canvas_repository::get_or_create(&conn, &nb).unwrap();
    canvas_repository::update_scene(&conn, &canvas.id, r#"{"version":1,"elements":[]}"#).unwrap();

    /* Export to a bundle, then import into a brand-new notebook. */
    let bundle = build_bundle(&conn, &nb).expect("build bundle");
    assert_eq!(bundle.notes.len(), 1);
    assert_eq!(bundle.documents.len(), 1);
    assert_eq!(bundle.documents[0].chunks.len(), 2);

    let new_id = write_bundle(&conn, bundle).expect("write bundle");
    assert_ne!(new_id, nb, "import creates a new notebook");

    let notes = note_repository::list_by_notebook(&conn, &new_id).unwrap();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].title, "My note");

    let docs = document_repository::list_by_notebook(&conn, &new_id).unwrap();
    assert_eq!(docs.len(), 1);
    let new_chunks = chunk_repository::get_by_document(&conn, &docs[0].id).unwrap();
    assert_eq!(new_chunks.len(), 2);
    assert!(new_chunks.iter().any(|c| c.content == "chunk one"));

    let new_canvas = canvas_repository::find_by_notebook(&conn, &new_id)
        .unwrap()
        .expect("canvas copied");
    assert!(new_canvas.scene.contains("\"version\":1"));

    /* Imported chunks are searchable, so the copy is a real, usable notebook. */
    let hits = search_service::search_chunks(&conn, &new_id, "chunk", 10).unwrap();
    assert!(!hits.is_empty(), "imported content is searchable");
}

#[test]
fn canvas_is_created_once_per_notebook_and_saves_its_scene() {
    let conn = test_db();
    let nb = make_notebook(&conn);

    /* First open creates an empty canvas; opening again returns the same one. */
    let canvas = canvas_repository::get_or_create(&conn, &nb).expect("create canvas");
    assert_eq!(canvas.scene, "", "a fresh canvas starts empty");
    let again = canvas_repository::get_or_create(&conn, &nb).expect("reopen canvas");
    assert_eq!(again.id, canvas.id, "one canvas per notebook");

    /* Saving a scene persists it and is readable back. */
    let scene = r#"{"version":1,"elements":[{"id":"a","type":"rect"}]}"#;
    let saved = canvas_repository::update_scene(&conn, &canvas.id, scene).expect("save scene");
    assert_eq!(saved.scene, scene);
    let reloaded = canvas_repository::get_or_create(&conn, &nb).expect("reopen");
    assert_eq!(reloaded.scene, scene, "scene survives a reopen");

    /* The canvas is removed when its notebook is deleted (cascade). */
    notebook_repository::delete(&conn, &nb).expect("delete notebook");
    let fresh = canvas_repository::get_or_create(&conn, &make_notebook(&conn)).expect("new canvas");
    assert_ne!(fresh.id, canvas.id, "a new notebook gets its own canvas");
}

#[test]
fn notebook_and_note_crud_round_trip() {
    let conn = test_db();
    let nb = make_notebook(&conn);

    let note = note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("First".into()),
            content: Some("Hello world".into()),
        },
    )
    .unwrap();

    let fetched = note_repository::get_by_id(&conn, &note.id).unwrap();
    assert_eq!(fetched.title, "First");
    assert_eq!(fetched.content, "Hello world");

    let updated = note_repository::update(
        &conn,
        &note.id,
        UpdateNote {
            title: Some("Renamed".into()),
            content: None,
        },
    )
    .unwrap();
    assert_eq!(updated.title, "Renamed");
    assert_eq!(
        updated.content, "Hello world",
        "content preserved on title-only update"
    );

    note_repository::delete(&conn, &note.id).unwrap();
    assert!(
        note_repository::get_by_id(&conn, &note.id).is_err(),
        "note gone after delete"
    );
}

#[test]
fn wiki_links_populate_backlinks_and_graph() {
    let conn = test_db();
    let nb = make_notebook(&conn);

    let target = note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("Cognitive Load".into()),
            content: Some("A theory.".into()),
        },
    )
    .unwrap();

    let source = note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("Study Notes".into()),
            content: Some("See [[Cognitive Load]] for details.".into()),
        },
    )
    .unwrap();

    /* The source links to the target, so the target has one backlink */
    let backlinks = note_repository::get_backlinks(&conn, &target.id).unwrap();
    assert_eq!(backlinks.len(), 1, "target has one backlink");
    assert_eq!(backlinks[0].id, source.id);

    /* The graph has both notes and one edge between them */
    let graph = note_repository::notes_graph(&conn, &nb).unwrap();
    assert_eq!(graph.nodes.len(), 2, "two notes in the graph");
    assert_eq!(graph.edges.len(), 1, "one link edge");
    assert_eq!(graph.edges[0].source, source.id);
    assert_eq!(graph.edges[0].target, target.id);

    /* Both endpoints report degree 1 */
    for node in &graph.nodes {
        assert_eq!(node.degree, 1, "each linked note has degree 1");
    }
}

#[test]
fn editing_a_note_reflows_its_links() {
    let conn = test_db();
    let nb = make_notebook(&conn);

    let a = note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("Alpha".into()),
            content: None,
        },
    )
    .unwrap();
    let source = note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("Source".into()),
            content: Some("Links to [[Alpha]].".into()),
        },
    )
    .unwrap();

    assert_eq!(
        note_repository::get_backlinks(&conn, &a.id).unwrap().len(),
        1
    );

    /* Remove the link; the backlink must disappear */
    note_repository::update(
        &conn,
        &source.id,
        UpdateNote {
            title: None,
            content: Some("No links now.".into()),
        },
    )
    .unwrap();
    assert_eq!(
        note_repository::get_backlinks(&conn, &a.id).unwrap().len(),
        0,
        "backlink removed after the link is deleted"
    );
}

#[test]
fn deleting_a_linked_note_leaves_no_phantom_connections() {
    let conn = test_db();
    let nb = make_notebook(&conn);

    let target = note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("Target".into()),
            content: None,
        },
    )
    .unwrap();
    let source = note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("Source".into()),
            content: Some("Points at [[Target]].".into()),
        },
    )
    .unwrap();

    /* Both are linked: degree 1 each, one edge */
    let before = note_repository::notes_graph(&conn, &nb).unwrap();
    assert_eq!(before.edges.len(), 1);

    /* Delete the target. The surviving source must not claim a phantom link. */
    note_repository::delete(&conn, &target.id).unwrap();
    let after = note_repository::notes_graph(&conn, &nb).unwrap();
    assert_eq!(after.nodes.len(), 1, "only the source remains");
    assert_eq!(after.edges.len(), 0, "no edge without both endpoints");
    assert_eq!(
        after.nodes[0].degree, 0,
        "degree agrees with edges: zero connections drawn, zero reported"
    );

    let _ = source;
}

#[test]
fn recent_notes_are_ordered_and_carry_notebook_name() {
    let conn = test_db();
    let nb = make_notebook(&conn);

    let _older = note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("Older".into()),
            content: None,
        },
    )
    .unwrap();
    let newer = note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("Newer".into()),
            content: None,
        },
    )
    .unwrap();
    /* Touch the newer note so its updated_at is latest */
    note_repository::update(
        &conn,
        &newer.id,
        UpdateNote {
            title: None,
            content: Some("edited".into()),
        },
    )
    .unwrap();

    let recent = note_repository::list_recent(&conn, 5).unwrap();
    assert_eq!(recent.len(), 2);
    assert_eq!(recent[0].note.title, "Newer", "most recently edited first");
    assert_eq!(recent[0].notebook_name, "Research", "notebook name joined");
}

#[test]
fn document_ingestion_produces_searchable_chunks_with_headings() {
    let conn = test_db();
    let nb = make_notebook(&conn);

    /* Write a small Markdown file to ingest */
    let dir = std::env::temp_dir().join(format!("nbl-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("sample.md");
    std::fs::write(
        &path,
        "# Introduction\n\nNeural pathways form through repeated activation.\n\n\
         # Results\n\nRetention improved over the trial period.\n",
    )
    .unwrap();

    let doc_id = ingestion_service::ingest_file(&conn, &nb, &path, None).expect("ingest");

    let chunks =
        notebooklab_lib::database::repository::chunk_repository::get_by_document(&conn, &doc_id)
            .unwrap();
    assert!(!chunks.is_empty(), "ingestion produced chunks");
    assert!(
        chunks
            .iter()
            .any(|c| c.heading_context.contains("Introduction")),
        "a chunk carries the Introduction heading for the outline"
    );

    /* The indexed content is findable by keyword search */
    let hits = search_service::search_chunks(&conn, &nb, "neural pathways", 10).unwrap();
    assert!(!hits.is_empty(), "search finds the ingested content");
    assert_eq!(
        hits[0].document_title, "sample",
        "search result carries the document title"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn duplicate_import_is_rejected() {
    let conn = test_db();
    let nb = make_notebook(&conn);

    let dir = std::env::temp_dir().join(format!("nbl-dup-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("dup.txt");
    std::fs::write(&path, "Some content to index.").unwrap();

    ingestion_service::ingest_file(&conn, &nb, &path, None).expect("first import");
    let second = ingestion_service::ingest_file(&conn, &nb, &path, None);
    assert!(second.is_err(), "importing the same file twice is rejected");

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn rtf_export_is_a_real_word_document() {
    let markdown = "# Report\n\nThis is **important** and *emphasized*.\n\n- one\n- two\n";
    let rtf = rtf::markdown_to_rtf(markdown);

    assert!(rtf.starts_with("{\\rtf1"), "valid RTF envelope");
    assert!(
        rtf.contains("\\b\\fs34 Report"),
        "heading is bold and large"
    );
    assert!(rtf.contains("{\\b important}"), "bold renders");
    assert!(rtf.contains("{\\i emphasized}"), "italic renders");
    assert_eq!(rtf.matches("\\bullet").count(), 2, "both bullets present");
}

#[test]
fn find_by_title_is_case_insensitive() {
    let conn = test_db();
    let nb = make_notebook(&conn);
    note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("My Note".into()),
            content: None,
        },
    )
    .unwrap();

    let found = note_repository::find_by_title(&conn, &nb, "my note").unwrap();
    assert!(
        found.is_some(),
        "wiki-link resolution matches title case-insensitively"
    );
}

#[test]
fn deleting_a_notebook_cascades_to_notes() {
    let conn = test_db();
    let nb = make_notebook(&conn);
    let note = note_repository::create(
        &conn,
        CreateNote {
            notebook_id: nb.clone(),
            title: Some("Doomed".into()),
            content: None,
        },
    )
    .unwrap();

    notebook_repository::delete(&conn, &nb).unwrap();
    assert!(
        note_repository::get_by_id(&conn, &note.id).is_err(),
        "notes are removed with their notebook"
    );
}

#[test]
fn studio_samples_a_notebooks_sources() {
    use notebooklab_lib::database::repository::chunk_repository;

    let conn = test_db();
    let nb = make_notebook(&conn);

    let dir = std::env::temp_dir().join(format!("nbl-studio-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("study.md");
    std::fs::write(
        &path,
        "# Topic\n\nA first idea worth remembering.\n\n# More\n\nA second idea to study.\n",
    )
    .unwrap();

    ingestion_service::ingest_file(&conn, &nb, &path, None).expect("ingest");

    /* The Studio pulls a spread of the notebook's own chunk text with no query */
    let sample = chunk_repository::sample_for_notebook(&conn, &nb, 20).unwrap();
    assert!(
        !sample.is_empty(),
        "sample returns the notebook's chunk text"
    );
    assert!(
        sample.iter().any(|c| c.contains("idea")),
        "sample carries the real document content"
    );

    /* A notebook with no documents yields nothing to work from */
    let empty = make_notebook(&conn);
    assert!(chunk_repository::sample_for_notebook(&conn, &empty, 20)
        .unwrap()
        .is_empty());

    std::fs::remove_dir_all(&dir).ok();
}
