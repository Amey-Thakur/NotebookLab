/*
 * Name: rtf.rs
 * Purpose: Convert Markdown to RTF that Word, Pages, and LibreOffice open as
 *   a real formatted document.
 * Description: RTF is a documented plain-text format, so this needs no external
 *   dependency and produces a genuine word-processor file, not a renamed text
 *   file. It handles the Markdown NotebookLab notes actually use: headings,
 *   bold, italic, inline code, bullet and numbered lists, and paragraphs.
 *   Anything it does not recognize is emitted as plain body text, so no input
 *   is ever lost.
 * Tech Stack: Rust
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

/// Convert a Markdown string into a complete RTF document.
pub fn markdown_to_rtf(markdown: &str) -> String {
    let mut body = String::new();

    for raw_line in markdown.lines() {
        let line = raw_line.trim_end();
        let trimmed = line.trim_start();

        if trimmed.is_empty() {
            body.push_str("\\par\n");
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("### ") {
            heading(&mut body, rest, 26);
        } else if let Some(rest) = trimmed.strip_prefix("## ") {
            heading(&mut body, rest, 30);
        } else if let Some(rest) = trimmed.strip_prefix("# ") {
            heading(&mut body, rest, 34);
        } else if let Some(rest) = bullet_item(trimmed) {
            body.push_str("{\\pntext\\bullet\\tab}");
            body.push_str(&inline(rest));
            body.push_str("\\par\n");
        } else if let Some(rest) = numbered_item(trimmed) {
            body.push_str(&inline(rest));
            body.push_str("\\par\n");
        } else if trimmed == "---" || trimmed == "***" {
            body.push_str("\\par\\brdrb\\brdrs\\brdrw10\\par\n");
        } else {
            body.push_str(&inline(trimmed));
            body.push_str("\\par\n");
        }
    }

    format!("{{\\rtf1\\ansi\\deff0{{\\fonttbl{{\\f0 Calibri;}}}}\\fs24\n{body}}}")
}

fn heading(body: &mut String, text: &str, size: u32) {
    body.push_str(&format!("{{\\b\\fs{size} {}}}\\par\n", inline(text)));
}

/// Strip a bullet marker (`- `, `* `, `+ `) and return the item text.
fn bullet_item(line: &str) -> Option<&str> {
    for marker in ["- ", "* ", "+ "] {
        if let Some(rest) = line.strip_prefix(marker) {
            return Some(rest);
        }
    }
    None
}

/// Strip a `N. ` numbered marker and return the item text.
fn numbered_item(line: &str) -> Option<&str> {
    let dot = line.find(". ")?;
    if dot > 0 && line[..dot].chars().all(|c| c.is_ascii_digit()) {
        Some(&line[dot + 2..])
    } else {
        None
    }
}

/// Render inline Markdown (bold, italic, code) with RTF escaping.
fn inline(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '*' && i + 1 < chars.len() && chars[i + 1] == '*' {
            if let Some(end) = find_close(&chars, i + 2, "**") {
                out.push_str("{\\b ");
                out.push_str(&escape(&chars[i + 2..end].iter().collect::<String>()));
                out.push('}');
                i = end + 2;
                continue;
            }
        }
        if chars[i] == '*' {
            if let Some(end) = find_close(&chars, i + 1, "*") {
                out.push_str("{\\i ");
                out.push_str(&escape(&chars[i + 1..end].iter().collect::<String>()));
                out.push('}');
                i = end + 1;
                continue;
            }
        }
        if chars[i] == '`' {
            if let Some(end) = find_close(&chars, i + 1, "`") {
                out.push_str("{\\f0\\cf1 ");
                out.push_str(&escape(&chars[i + 1..end].iter().collect::<String>()));
                out.push('}');
                i = end + 1;
                continue;
            }
        }
        out.push_str(&escape_char(chars[i]));
        i += 1;
    }

    out
}

/// Find the closing delimiter starting at `from`, returning its start index.
fn find_close(chars: &[char], from: usize, delim: &str) -> Option<usize> {
    let d: Vec<char> = delim.chars().collect();
    let mut i = from;
    while i + d.len() <= chars.len() {
        if chars[i..i + d.len()] == d[..] {
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Escape RTF control characters and non-ASCII in a string.
fn escape(text: &str) -> String {
    text.chars().map(escape_char).collect()
}

fn escape_char(c: char) -> String {
    match c {
        '\\' => "\\\\".to_string(),
        '{' => "\\{".to_string(),
        '}' => "\\}".to_string(),
        c if (c as u32) < 128 => c.to_string(),
        /* RTF encodes non-ASCII as signed 16-bit unicode escapes */
        c => format!("\\u{}?", c as i32),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wraps_in_rtf_envelope() {
        let rtf = markdown_to_rtf("hello");
        assert!(rtf.starts_with("{\\rtf1"));
        assert!(rtf.trim_end().ends_with('}'));
        assert!(rtf.contains("hello"));
    }

    #[test]
    fn heading_is_bold_and_larger() {
        let rtf = markdown_to_rtf("# Title");
        assert!(rtf.contains("\\b\\fs34 Title"));
    }

    #[test]
    fn bold_and_italic_render() {
        let rtf = markdown_to_rtf("**bold** and *italic*");
        assert!(rtf.contains("{\\b bold}"));
        assert!(rtf.contains("{\\i italic}"));
    }

    #[test]
    fn braces_are_escaped() {
        let rtf = markdown_to_rtf("use {braces}");
        assert!(rtf.contains("\\{braces\\}"));
    }

    #[test]
    fn bullets_get_markers() {
        let rtf = markdown_to_rtf("- one\n- two");
        assert_eq!(rtf.matches("\\bullet").count(), 2);
    }

    #[test]
    fn non_ascii_is_escaped() {
        let rtf = markdown_to_rtf("caf\u{e9}");
        assert!(rtf.contains("\\u233?"));
    }
}
