/*
 * Title: chunking_tests.rs
 * Tech Stack: Rust, integration tests
 * Description: Tests for the text chunking service used in the RAG pipeline.
 * Important Details: Verifies chunk sizing, overlap behavior, edge cases
 *   (empty input, single paragraph, very long text), and metadata propagation.
 */

use notebooklab_lib::services::chunking_service::chunk_text;

#[test]
fn empty_text_produces_no_chunks() {
    let chunks = chunk_text("doc1", "", None, "");
    assert!(chunks.is_empty(), "Empty text should produce no chunks");
}

#[test]
fn whitespace_only_produces_no_chunks() {
    let chunks = chunk_text("doc1", "   \n\n   \n\n   ", None, "");
    assert!(
        chunks.is_empty(),
        "Whitespace-only text should produce no chunks"
    );
}

#[test]
fn single_short_paragraph_becomes_one_chunk() {
    let text = "This is a short paragraph about AI.";
    let chunks = chunk_text("doc1", text, Some(1), "Introduction");

    assert_eq!(chunks.len(), 1);
    assert_eq!(chunks[0].content, text);
    assert_eq!(chunks[0].document_id, "doc1");
    assert_eq!(chunks[0].page_number, Some(1));
    assert_eq!(chunks[0].heading_context, "Introduction");
    assert_eq!(chunks[0].position, 0);
    assert!(chunks[0].token_count > 0);
}

#[test]
fn long_text_splits_into_multiple_chunks() {
    /* Generate text with multiple paragraphs that exceed the ~400 token target.
    The chunker splits on double-newlines, so each paragraph must be separated. */
    let paragraph = "This is a paragraph with enough words to contribute to the token count for testing purposes in the chunking service.";
    let paragraphs: Vec<&str> = (0..50).map(|_| paragraph).collect();
    let text = paragraphs.join("\n\n");

    let chunks = chunk_text("doc1", &text, None, "");

    assert!(
        chunks.len() > 1,
        "Long text should split into multiple chunks"
    );

    /* Each chunk should have reasonable token counts */
    for chunk in &chunks {
        assert!(!chunk.content.is_empty(), "No chunk should be empty");
        assert!(
            chunk.token_count > 0,
            "Each chunk should have positive token count"
        );
    }

    /* Positions should be sequential */
    for (i, chunk) in chunks.iter().enumerate() {
        assert_eq!(chunk.position, i as i32, "Positions should be sequential");
    }
}

#[test]
fn chunks_preserve_document_id() {
    let text = "First paragraph.\n\nSecond paragraph.";
    let chunks = chunk_text("my-doc-id", text, None, "");

    for chunk in &chunks {
        assert_eq!(chunk.document_id, "my-doc-id");
    }
}

#[test]
fn chunks_preserve_heading_context() {
    let text = "Some content about machine learning.";
    let chunks = chunk_text("doc1", text, None, "Chapter 1: Intro");

    assert_eq!(chunks[0].heading_context, "Chapter 1: Intro");
}

#[test]
fn multiple_paragraphs_within_limit_stay_together() {
    let text = "Short paragraph one.\n\nShort paragraph two.\n\nShort paragraph three.";
    let chunks = chunk_text("doc1", text, None, "");

    /* Three short paragraphs should fit in one chunk */
    assert_eq!(chunks.len(), 1);
    assert!(chunks[0].content.contains("one"));
    assert!(chunks[0].content.contains("two"));
    assert!(chunks[0].content.contains("three"));
}

#[test]
fn page_number_propagates_to_all_chunks() {
    let paragraph = "A paragraph with several words to fill the chunk and ensure we exceed the token limit for splitting purposes.";
    let paragraphs: Vec<&str> = (0..50).map(|_| paragraph).collect();
    let text = paragraphs.join("\n\n");
    let chunks = chunk_text("doc1", &text, Some(42), "");

    for chunk in &chunks {
        assert_eq!(chunk.page_number, Some(42));
    }
}
