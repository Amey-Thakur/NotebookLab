/*
 * Name: chunking_service.rs
 * Purpose: Text chunking for RAG.
 * Description: Splits parsed document pages into overlapping chunks suitable
 *   for embedding and retrieval. Uses paragraph-aware splitting
 *   that respects sentence boundaries. Target ~400 tokens per
 *   chunk with 50-token overlap. Tokens are approximated as word
 *   count * 1.3 for spaced scripts, plus one per character for
 *   scripts written without spaces (CJK, Thai, Lao), which have no
 *   words to count.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use crate::database::models::CreateChunk;

const TARGET_TOKENS: usize = 400;
const OVERLAP_TOKENS: usize = 50;
const APPROX_TOKENS_PER_WORD: f32 = 1.3;

/// Split text into overlapping chunks with positional metadata.
pub fn chunk_text(
    document_id: &str,
    text: &str,
    page_number: Option<i32>,
    heading_context: &str,
) -> Vec<CreateChunk> {
    let paragraphs = split_into_paragraphs(text);
    let mut chunks = Vec::new();
    let mut current_text = String::new();
    let mut position = 0;

    for paragraph in &paragraphs {
        let combined_tokens = approx_token_count(&current_text) + approx_token_count(paragraph);

        if combined_tokens > TARGET_TOKENS && !current_text.is_empty() {
            /* Current buffer exceeds target, emit as a chunk */
            let token_count = approx_token_count(&current_text);

            chunks.push(CreateChunk {
                document_id: document_id.to_string(),
                content: current_text.trim().to_string(),
                position,
                page_number,
                heading_context: heading_context.to_string(),
                token_count: token_count as i32,
            });

            position += 1;

            /* Keep overlap from the end of the current chunk */
            current_text = get_overlap_text(&current_text, OVERLAP_TOKENS);
        }

        if !current_text.is_empty() && !paragraph.is_empty() {
            current_text.push_str("\n\n");
        }
        current_text.push_str(paragraph);
    }

    /* Emit remaining text as the final chunk */
    if !current_text.trim().is_empty() {
        let token_count = approx_token_count(&current_text);
        chunks.push(CreateChunk {
            document_id: document_id.to_string(),
            content: current_text.trim().to_string(),
            position,
            page_number,
            heading_context: heading_context.to_string(),
            token_count: token_count as i32,
        });
    }

    chunks
}

/// Split text into paragraphs (double newline separated).
fn split_into_paragraphs(text: &str) -> Vec<String> {
    text.split("\n\n")
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .flat_map(|p| split_oversized(&p))
        .collect()
}

/// Sentence terminators, including the full-width forms used in CJK text.
///
/// Splitting on the ASCII set alone never fired on Japanese or Chinese, which
/// end sentences with a full-width stop. Those documents fell through to the
/// word fallback, which is also meaningless for them, so nothing split at all.
const SENTENCE_ENDERS: [char; 8] = [
    '.', '!', '?', '\n', '\u{3002}', '\u{ff01}', '\u{ff1f}', '\u{ff0e}',
];

/// Break a paragraph that is on its own larger than a chunk.
///
/// Splitting on blank lines alone assumes documents have them. A minified JSON
/// dump, a single-line log, or an export with no paragraph breaks arrives as
/// one paragraph, and the chunk loop only emits when the buffer is non-empty,
/// so that whole file became a single chunk. A 50 MB chunk is a 50 MB row for
/// FTS5 to index and, worse, a 50 MB body sent to whichever provider is active.
///
/// Sentences first, since they keep meaning intact; then a hard split, which
/// prefers a space but does not require one, because text in an unspaced script
/// has none to prefer.
fn split_oversized(paragraph: &str) -> Vec<String> {
    if approx_token_count(paragraph) <= TARGET_TOKENS {
        return vec![paragraph.to_string()];
    }

    let mut out: Vec<String> = Vec::new();
    let mut buf = String::new();

    for sentence in paragraph.split_inclusive(SENTENCE_ENDERS) {
        if !buf.is_empty()
            && approx_token_count(&buf) + approx_token_count(sentence) > TARGET_TOKENS
        {
            out.push(std::mem::take(&mut buf).trim().to_string());
        }
        if approx_token_count(sentence) > TARGET_TOKENS {
            /* One sentence too big on its own. Flush what is held, then break
            the sentence itself rather than emitting it whole. */
            if !buf.trim().is_empty() {
                out.push(std::mem::take(&mut buf).trim().to_string());
            }
            buf.clear();
            out.extend(hard_split(sentence));
        } else {
            buf.push_str(sentence);
        }
    }

    if !buf.trim().is_empty() {
        out.push(buf.trim().to_string());
    }
    out.retain(|p| !p.trim().is_empty());
    out
}

/// Cut text into pieces of at most `TARGET_TOKENS`, at a space when there is
/// one nearby and at a character boundary otherwise.
///
/// The previous last resort was `split_whitespace`, which returns the entire
/// input as a single item for Japanese, Chinese, Korean, Thai and Lao. The
/// "fallback" therefore emitted exactly what it was meant to break up.
fn hard_split(text: &str) -> Vec<String> {
    let mut pieces = Vec::new();
    let mut current = String::new();
    let (mut dense, mut words) = (0usize, 0usize);
    let mut inside_word = false;
    /* Byte offset of the last space seen in `current`, so a break can prefer a
    word boundary when the script has them. */
    let mut last_space: Option<usize> = None;

    for c in text.chars() {
        if c.is_whitespace() {
            last_space = Some(current.len());
        }
        classify(c, &mut dense, &mut words, &mut inside_word);
        current.push(c);

        if measure(dense, words) < TARGET_TOKENS {
            continue;
        }

        match last_space {
            Some(at) if at > 0 => {
                let (head, tail) = current.split_at(at);
                let head = head.trim().to_string();
                let tail = tail.trim_start().to_string();
                if !head.is_empty() {
                    pieces.push(head);
                }
                current = tail;
            }
            _ => {
                /* No space to break at: an unspaced script, or one enormous
                token. Cut on the character boundary, which is always safe. */
                pieces.push(std::mem::take(&mut current).trim().to_string());
            }
        }
        last_space = None;
        /* Recount what was carried over. The counters are incremental, and an
        earlier version left them holding the pre-split totals: for spaced text
        that froze the measurement, so nothing split after the first cut and the
        remainder came out as one unbounded piece. */
        let counted = count_parts(&current);
        dense = counted.0;
        words = counted.1;
        inside_word = current
            .chars()
            .next_back()
            .is_some_and(|c| !c.is_whitespace() && !is_unspaced_script(c));
    }

    if !current.trim().is_empty() {
        pieces.push(current.trim().to_string());
    }
    pieces.retain(|p| !p.is_empty());
    pieces
}

/// Fold one character into a running count of unspaced characters and words.
fn classify(c: char, dense: &mut usize, words: &mut usize, inside_word: &mut bool) {
    if is_unspaced_script(c) {
        *dense += 1;
        *inside_word = false;
    } else if c.is_whitespace() {
        *inside_word = false;
    } else if !*inside_word {
        *inside_word = true;
        *words += 1;
    }
}

/// Combine the two counts into an approximate token total.
fn measure(dense: usize, words: usize) -> usize {
    dense + (words as f32 * APPROX_TOKENS_PER_WORD) as usize
}

/// Count a whole string, for the places that need to start over.
fn count_parts(text: &str) -> (usize, usize) {
    let (mut dense, mut words) = (0usize, 0usize);
    let mut inside_word = false;
    for c in text.chars() {
        classify(c, &mut dense, &mut words, &mut inside_word);
    }
    (dense, words)
}

/// Scripts written without spaces between words.
///
/// Counting whitespace-separated words is meaningless for these: a page of
/// Japanese is one "word", so every length check based on it reads as almost
/// nothing.
fn is_unspaced_script(c: char) -> bool {
    matches!(c as u32,
        0x3040..=0x30FF     // hiragana and katakana
        | 0x3400..=0x4DBF   // CJK unified ideographs extension A
        | 0x4E00..=0x9FFF   // CJK unified ideographs
        | 0xF900..=0xFAFF   // CJK compatibility ideographs
        | 0xAC00..=0xD7AF   // hangul syllables
        | 0x0E00..=0x0E7F   // thai
        | 0x0E80..=0x0EFF   // lao
    )
}

/// Approximate token count.
///
/// This was word count times 1.3, and the header called it "conservative for
/// CJK". It was the exact opposite. Japanese, Chinese, Korean and Thai are
/// written without spaces, so `split_whitespace` returns one item for an entire
/// document: five thousand characters of Japanese counted as one token, the
/// 400-token target was never reached, and the whole document became a single
/// chunk. Retrieval then had nothing to rank and every citation pointed at the
/// entire file.
///
/// Characters in those scripts are counted individually, which is close to what
/// real tokenizers do and errs slightly high, so chunks come out a little small
/// rather than unbounded. Text in spaced scripts counts exactly as before, so
/// nothing already indexed changes shape.
fn approx_token_count(text: &str) -> usize {
    let (dense, words) = count_parts(text);
    measure(dense, words)
}

/// Extract roughly the last N tokens of a chunk, to overlap into the next one.
///
/// Measured the same way the budget is. Taking the last N whitespace-separated
/// words returned the entire text for an unspaced script, since it is one
/// "word", so the overlap was the whole chunk and every chunk after the first
/// began with a full copy of its predecessor.
fn get_overlap_text(text: &str, target_tokens: usize) -> String {
    if approx_token_count(text) <= target_tokens {
        return text.to_string();
    }

    /* Walk back from the end until enough tokens are held. char_indices keeps
    every candidate on a character boundary, so no slice can split one. */
    let mut start = text.len();
    for (index, c) in text.char_indices().rev() {
        let piece = &text[index..];
        if approx_token_count(piece) >= target_tokens {
            start = index;
            /* Prefer beginning at a word boundary where the script has them. */
            if !is_unspaced_script(c) {
                if let Some(space) = piece.find(char::is_whitespace) {
                    start = index + space + 1;
                }
            }
            break;
        }
        start = index;
    }

    text[start..].trim_start().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// No chunk should ever be wildly larger than the target. The bound is
    /// generous because the overlap and the final paragraph can push a chunk
    /// past the target legitimately; what it catches is a runaway.
    fn assert_bounded(chunks: &[CreateChunk]) {
        for c in chunks {
            let n = approx_token_count(&c.content);
            assert!(
                n <= TARGET_TOKENS * 2,
                "chunk of {n} tokens is unbounded (target {TARGET_TOKENS})"
            );
        }
    }

    #[test]
    fn unspaced_scripts_are_counted_by_character() {
        /* The bug in one line: whitespace words are meaningless here. */
        let japanese = "\u{6a5f}\u{68b0}\u{5b66}\u{7fd2}";
        assert_eq!(japanese.split_whitespace().count(), 1);
        assert_eq!(approx_token_count(japanese), 4);
    }

    #[test]
    fn spaced_text_counts_exactly_as_before() {
        /* Nothing already indexed should change shape. */
        assert_eq!(approx_token_count("one two three"), (3.0 * 1.3) as usize);
        assert_eq!(approx_token_count(""), 0);
    }

    #[test]
    fn mixed_scripts_add_up() {
        /* Technical writing routinely mixes the two. */
        let mixed = "RAG \u{306f}\u{691c}\u{7d22}\u{3067}\u{3059}";
        assert_eq!(approx_token_count(mixed), 5 + (1.3_f32) as usize);
    }

    #[test]
    fn a_long_japanese_document_actually_chunks() {
        /* Before the fix this produced exactly one chunk holding the whole
        document, whatever its length, so retrieval had nothing to rank and
        every citation pointed at the entire file. */
        let sentence = "\u{6a5f}\u{68b0}\u{5b66}\u{7fd2}\u{306f}\u{4eba}\u{5de5}\u{77e5}\u{80fd}\u{306e}\u{4e00}\u{5206}\u{91ce}\u{3067}\u{3042}\u{308b}\u{3002}";
        let document = sentence.repeat(200);
        let chunks = chunk_text("doc", &document, None, "");
        assert!(
            chunks.len() > 1,
            "expected several chunks, got {}",
            chunks.len()
        );
        assert_bounded(&chunks);
    }

    #[test]
    fn a_japanese_paragraph_with_no_terminator_still_splits() {
        /* No full stops and no spaces: the case where every previous strategy
        had nothing to break on. */
        let run = "\u{3042}".repeat(TARGET_TOKENS * 5);
        let chunks = chunk_text("doc", &run, None, "");
        assert!(chunks.len() > 1);
        assert_bounded(&chunks);
    }

    #[test]
    fn overlap_does_not_repeat_the_whole_chunk() {
        /* Taking the last N whitespace words returned everything for an
        unspaced script, so each chunk began with a full copy of the last. */
        let text = "\u{3042}".repeat(1000);
        let overlap = get_overlap_text(&text, OVERLAP_TOKENS);
        assert!(
            overlap.chars().count() < text.chars().count(),
            "overlap took the whole text"
        );
        assert!(approx_token_count(&overlap) <= OVERLAP_TOKENS * 2);
    }

    #[test]
    fn japanese_chunking_loses_nothing() {
        /* Splitting must partition the text, never drop part of it. Overlap
        means the rejoined text can repeat, so this checks it never shrinks. */
        let sentence = "\u{6a5f}\u{68b0}\u{5b66}\u{7fd2}\u{3002}";
        let document = sentence.repeat(300);
        let chunks = chunk_text("doc", &document, None, "");
        let rejoined: usize = chunks
            .iter()
            .map(|c| c.content.replace(['\n', ' '], "").chars().count())
            .sum();
        assert!(rejoined >= document.chars().count());
    }

    #[test]
    fn a_file_with_no_blank_line_still_chunks() {
        /* The failing shape. Splitting on "\n\n" alone found one paragraph,
        and the loop only emits when the buffer is non-empty, so the entire
        file became a single chunk. */
        let text = "word ".repeat(TARGET_TOKENS * 6);
        let chunks = chunk_text("doc", &text, None, "");
        assert!(
            chunks.len() > 1,
            "expected several chunks, got {}",
            chunks.len()
        );
        assert_bounded(&chunks);
    }

    #[test]
    fn one_enormous_sentence_is_still_bounded() {
        /* Minified JSON and single-line logs: no sentence endings at all, so
        the word fallback is the only thing that can break this up. */
        let text = format!("{{\"k\":\"{}\"}}", "v ".repeat(TARGET_TOKENS * 4));
        let chunks = chunk_text("doc", &text, None, "");
        assert!(chunks.len() > 1);
        assert_bounded(&chunks);
    }

    #[test]
    fn sentences_are_preferred_over_words() {
        let sentence = format!("{}. ", "word ".repeat(60));
        let chunks = chunk_text("doc", &sentence.repeat(12), None, "");
        assert!(chunks.len() > 1);
        assert_bounded(&chunks);
        /* Splitting on sentence ends keeps the period attached, so a chunk
        should not begin mid-sentence with a bare fragment. */
        assert!(chunks[0].content.contains('.'));
    }

    #[test]
    fn ordinary_prose_is_untouched() {
        let text = "First para.\n\nSecond para.\n\nThird para.";
        let chunks = chunk_text("doc", text, None, "");
        assert_eq!(chunks.len(), 1, "short prose still fits in one chunk");
        assert!(chunks[0].content.contains("First para."));
        assert!(chunks[0].content.contains("Third para."));
    }

    #[test]
    fn empty_input_produces_nothing() {
        assert!(chunk_text("doc", "", None, "").is_empty());
        assert!(chunk_text("doc", "   \n\n  \n\n ", None, "").is_empty());
    }

    #[test]
    fn positions_are_sequential() {
        let text = "word ".repeat(TARGET_TOKENS * 5);
        let chunks = chunk_text("doc", &text, None, "");
        for (i, c) in chunks.iter().enumerate() {
            assert_eq!(c.position, i as i32, "positions must be 0..n");
        }
    }
}
