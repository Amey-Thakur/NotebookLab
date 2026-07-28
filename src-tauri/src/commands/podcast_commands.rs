/*
 * Name: podcast_commands.rs
 * Purpose: Tauri commands for AI audio-overview script generation.
 * Description: Uses the active LLM provider to generate a spoken-overview script
 *   from document context in one of several formats: a two-host
 *   discussion, a single-narrator brief, a debate, or a critique.
 *   The chosen format's prompt is loaded from a file and the
 *   document text is passed as data inside <document_context>, so
 *   source content is never treated as instructions. The Rust
 *   backend handles script generation only; audio synthesis is
 *   handled by the frontend using the browser's SpeechSynthesis API
 *   (offline, cross-platform, zero-config). This can be upgraded to
 *   Piper/Kokoro TTS later for higher quality voices.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use crate::error::{AppError, AppResult};
use crate::providers::traits::TaskPurpose;
use crate::services::job_runner::{self, Generation};

const DISCUSSION_PROMPT: &str = include_str!("../../resources/prompts/podcast-discussion.txt");
const BRIEF_PROMPT: &str = include_str!("../../resources/prompts/podcast-brief.txt");
const DEBATE_PROMPT: &str = include_str!("../../resources/prompts/podcast-debate.txt");
const CRITIQUE_PROMPT: &str = include_str!("../../resources/prompts/podcast-critique.txt");
const INTERVIEW_PROMPT: &str = include_str!("../../resources/prompts/podcast-interview.txt");
const LECTURE_PROMPT: &str = include_str!("../../resources/prompts/podcast-lecture.txt");
const QANDA_PROMPT: &str = include_str!("../../resources/prompts/podcast-qanda.txt");

/// A single turn in the podcast script.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PodcastTurn {
    pub speaker: String,
    pub text: String,
}

/// Generated podcast script.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PodcastScript {
    pub title: String,
    pub turns: Vec<PodcastTurn>,
}

/// Start an audio script and return its job id at once.
///
/// The whole generation used to run inside this command while the frontend
/// awaited it. On a local model that regularly outran the request timeout, so
/// the user waited several minutes and was then told the model "did not answer
/// in time" -- and the work was lost if they had navigated away. It is a tracked
/// job now: progress is reported, the result waits in the job, and leaving the
/// page no longer throws the work away.
///
/// The finished `PodcastScript` is carried as JSON in the job result, because a
/// job result is a string. The frontend parses it back.
#[tauri::command(rename_all = "snake_case")]
pub fn generate_podcast(
    app: tauri::AppHandle,
    notebook_id: String,
    topic: Option<String>,
    format: Option<String>,
    document_ids: Option<Vec<String>>,
) -> AppResult<String> {
    let format = format.unwrap_or_else(|| "discussion".to_string());
    let (system_prompt, label) = match format.as_str() {
        "discussion" => (DISCUSSION_PROMPT, "Discussion"),
        "brief" => (BRIEF_PROMPT, "Brief"),
        "debate" => (DEBATE_PROMPT, "Debate"),
        "critique" => (CRITIQUE_PROMPT, "Critique"),
        "interview" => (INTERVIEW_PROMPT, "Interview"),
        "lecture" => (LECTURE_PROMPT, "Lecture"),
        "qanda" => (QANDA_PROMPT, "Questions"),
        other => {
            return Err(AppError::InvalidInput(format!(
                "Unknown audio format: {other}"
            )));
        }
    };

    let docs = document_ids.unwrap_or_default();
    let nb = notebook_id.clone();
    let topic_for_prompt = topic.clone();
    let title = match topic.as_deref().map(str::trim) {
        Some(t) if !t.is_empty() => format!("{label}: {t}"),
        _ => label.to_string(),
    };

    job_runner::spawn(
        &app,
        Generation {
            kind: "audio",
            label: title.clone(),
            notebook_id,
            system_prompt: system_prompt.to_string(),
            max_tokens: 2000,
            temperature: 0.7,
            purpose: TaskPurpose::Quality,
        },
        Box::new(move |conn| gather_sources(conn, &nb, &docs)),
        Box::new(move |context| {
            /* Document text goes inside <document_context> and is treated as
            data; the topic is a separate directive, matching the injection-safe
            pattern the Studio prompts use. */
            let context = crate::utils::text_utils::truncate_to_char_boundary(context, 4000);
            let directive = match topic_for_prompt.as_deref().map(str::trim) {
                Some(t) if !t.is_empty() => format!("Focus especially on: {t}"),
                _ => "Cover the key ideas across the documents.".to_string(),
            };
            format!("<document_context>\n{context}\n</document_context>\n\n{directive}")
        }),
        Box::new(move |content| {
            let turns = parse_script(&content);
            if turns.is_empty() {
                return Err(AppError::Internal(
                    "The model returned nothing usable. Try again, or pick a \
                     different model in Models."
                        .into(),
                ));
            }
            let script = PodcastScript { title, turns };
            serde_json::to_string(&script)
                .map_err(|e| AppError::Internal(format!("Could not encode the script: {e}")))
        }),
    )
}

/// Read the passages an audio script is built from: the chosen documents, or
/// the whole notebook when nothing is chosen.
fn gather_sources(
    conn: &rusqlite::Connection,
    notebook_id: &str,
    documents: &[String],
) -> AppResult<String> {
    let chunks: Vec<String> = if documents.is_empty() {
        let mut stmt = conn.prepare(
            "SELECT c.content FROM chunks c
             INNER JOIN documents d ON c.document_id = d.id
             WHERE d.notebook_id = ?1 AND d.status = 'processed'
             ORDER BY d.created_at, c.position
             LIMIT 20",
        )?;
        stmt.query_map(rusqlite::params![notebook_id], |row| {
            row.get::<_, String>(0)
        })?
        .filter_map(|r| r.ok())
        .collect()
    } else {
        crate::database::repository::chunk_repository::sample_for_documents(conn, documents, 20)?
    };

    if chunks.is_empty() {
        return Err(AppError::InvalidInput(if documents.is_empty() {
            "No processed documents found. Import documents first.".into()
        } else {
            "The selected documents have no readable text yet. They may still \
             be processing."
                .to_string()
        }));
    }

    Ok(chunks.join("\n\n---\n\n"))
}

/// Parse LLM output into structured turns.
///
/// The prompts all ask for bare `A:` and `B:` prefixes, and the original parser
/// accepted only those. Models do not comply that exactly: a small local one
/// routinely emits `**A:**`, `- A:`, `Speaker A -`, or opens with a line of
/// preamble. Every unrecognised line was skipped, so a reply that read perfectly
/// well produced zero turns and the feature failed with "LLM generated an empty
/// script" on output that was actually fine.
///
/// So: strip the decoration models add, accept the spellings they actually use,
/// and fall back to treating prose as a single narrator rather than throwing
/// away a usable script over its formatting.
fn parse_script(text: &str) -> Vec<PodcastTurn> {
    let mut turns: Vec<PodcastTurn> = Vec::new();

    for raw in text.lines() {
        let line = strip_decoration(raw);
        if line.is_empty() {
            continue;
        }

        match split_speaker(line) {
            Some((speaker, content)) if !content.is_empty() => turns.push(PodcastTurn {
                speaker: speaker.to_string(),
                text: content.to_string(),
            }),
            /* A continuation line: the model wrapped one turn across several
            lines. Append it to the turn it belongs to rather than dropping it,
            which used to silently truncate long answers. */
            None => {
                if let Some(last) = turns.last_mut() {
                    last.text.push(' ');
                    last.text.push_str(line);
                }
            }
            _ => {}
        }
    }

    if !turns.is_empty() {
        return turns;
    }

    /* Nothing carried a speaker label. Rather than fail, read it as a single
    narrator, which is exactly right for the brief and lecture formats and
    still usable for the rest. */
    narrate(text)
}

/// Characters models decorate a line with that carry no meaning when spoken.
/// Stripping them is doubly right here: it lets the label parse, and it keeps a
/// speech synthesizer from reading asterisks aloud.
const MARKUP: [char; 3] = ['*', '#', '`'];

/// Remove list markers and surrounding markup from a line.
fn strip_decoration(line: &str) -> &str {
    let mut s = line.trim();
    for marker in ["- ", "* ", "> ", "+ "] {
        if let Some(rest) = s.strip_prefix(marker) {
            s = rest.trim_start();
        }
    }
    s.trim_matches(|c: char| MARKUP.contains(&c)).trim()
}

/// Split a line into speaker and content, accepting the spellings models use.
///
/// Returns `None` when the line carries no label at all, which the caller reads
/// as a continuation of the previous turn.
fn split_speaker(line: &str) -> Option<(&'static str, &str)> {
    let (head, rest) = line.split_once([':', '-', '\u{2013}'])?;
    let head = head.trim_matches(|c: char| MARKUP.contains(&c) || c.is_whitespace());

    /* Only a short head can be a speaker label. Without this a sentence that
    happens to contain a dash ("the model - which runs locally - answers")
    would be read as a speaker called "the model". */
    if head.is_empty() || head.chars().count() > 12 {
        return None;
    }

    /* The closing half of "**A:**" lands at the front of the content, so the
    content needs the same cleaning as the label rather than carrying the
    stray markup into the spoken text. */
    let rest = rest.trim_start_matches(|c: char| MARKUP.contains(&c) || c.is_whitespace());

    let upper = head.to_ascii_uppercase();
    let normalized = upper.strip_prefix("SPEAKER").unwrap_or(&upper).trim();

    match normalized {
        "A" | "HOST" | "NARRATOR" | "INTERVIEWER" | "Q" | "QUESTION" => {
            Some(("A", rest.trim_end()))
        }
        "B" | "GUEST" | "EXPERT" | "ANSWER" => Some(("B", rest.trim_end())),
        _ => None,
    }
}

/// Read unlabelled prose as one narrator, one turn per paragraph.
fn narrate(text: &str) -> Vec<PodcastTurn> {
    text.split("\n\n")
        .map(|p| strip_decoration(p).replace('\n', " "))
        .map(|p| p.trim().to_string())
        .filter(|p| p.len() > 1)
        .map(|text| PodcastTurn {
            speaker: "A".to_string(),
            text,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_prefixes_parse() {
        let turns = parse_script("A: Hello there.\nB: And hello back.");
        assert_eq!(turns.len(), 2);
        assert_eq!(turns[0].speaker, "A");
        assert_eq!(turns[0].text, "Hello there.");
        assert_eq!(turns[1].speaker, "B");
    }

    #[test]
    fn markdown_bold_parses() {
        /* What a small local model actually emits. Every one of these lines
        was skipped before, which failed the whole feature on a good reply. */
        let turns = parse_script("**A:** Hello there.\n**B:** And hello back.");
        assert_eq!(turns.len(), 2, "bolded labels must still parse");
        assert_eq!(turns[0].text, "Hello there.");
    }

    #[test]
    fn list_markers_parse() {
        let turns = parse_script("- A: One.\n* B: Two.");
        assert_eq!(turns.len(), 2);
        assert_eq!(turns[1].text, "Two.");
    }

    #[test]
    fn speaker_word_and_roles_parse() {
        let turns = parse_script(
            "Speaker A: One.\nSpeaker B: Two.\nHost: Three.\nGuest: Four.\nNarrator: Five.",
        );
        assert_eq!(turns.len(), 5);
        assert_eq!(turns[2].speaker, "A", "Host is the A voice");
        assert_eq!(turns[3].speaker, "B", "Guest is the B voice");
    }

    #[test]
    fn wrapped_lines_join_the_previous_turn() {
        let turns = parse_script("A: One sentence\nand its continuation.\nB: Two.");
        assert_eq!(turns.len(), 2);
        assert_eq!(turns[0].text, "One sentence and its continuation.");
    }

    #[test]
    fn a_preamble_does_not_empty_the_script() {
        let turns = parse_script("Sure, here is the discussion you asked for.\n\nA: One.\nB: Two.");
        assert_eq!(turns.len(), 2, "the preamble is dropped, the script is not");
        assert_eq!(turns[0].text, "One.");
    }

    #[test]
    fn unlabelled_prose_becomes_a_narration() {
        /* The brief and lecture formats are one voice, and a model that ignores
        the prefix instruction returns plain paragraphs. That is a usable
        script; refusing it lost work the user had waited minutes for. */
        let turns = parse_script("First paragraph of the brief.\n\nSecond paragraph.");
        assert_eq!(turns.len(), 2);
        assert!(turns.iter().all(|t| t.speaker == "A"));
        assert_eq!(turns[1].text, "Second paragraph.");
    }

    #[test]
    fn prose_with_a_dash_is_not_read_as_a_speaker() {
        /* The dash split is what makes "A - hello" work; it must not turn an
        ordinary sentence containing a dash into a speaker named after its
        first clause. */
        let turns = parse_script(
            "The model, which runs locally - entirely on your machine - answers questions.",
        );
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].speaker, "A");
        assert!(turns[0].text.contains("entirely on your machine"));
    }

    #[test]
    fn empty_input_yields_nothing() {
        assert!(parse_script("").is_empty());
        assert!(parse_script("   \n\n  ").is_empty());
    }
}
