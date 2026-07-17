/*
 * Name: log_buffer.rs
 * Purpose: Keep the most recent log lines in memory for the in-app log view.
 * Description: A tracing writer that tees every formatted log line to the
 *   console (as before) and into a capped ring buffer, so Settings can show
 *   what the backend has been doing without asking users to find a terminal.
 *   The buffer holds the last 500 lines and costs one short lock per line;
 *   nothing is ever written to disk. ANSI colors are disabled at the
 *   subscriber so the captured lines read cleanly in the UI.
 * Tech Stack: Rust, tracing-subscriber
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

use std::collections::VecDeque;
use std::io::Write;
use std::sync::Mutex;

const MAX_LINES: usize = 500;

static BUFFER: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

/// The most recent log lines, oldest first.
pub fn recent_lines() -> Vec<String> {
    BUFFER
        .lock()
        .map(|buffer| buffer.iter().cloned().collect())
        .unwrap_or_default()
}

fn push_line(line: &str) {
    let trimmed = line.trim_end();
    if trimmed.is_empty() {
        return;
    }
    if let Ok(mut buffer) = BUFFER.lock() {
        if buffer.len() >= MAX_LINES {
            buffer.pop_front();
        }
        buffer.push_back(trimmed.to_string());
    }
}

/// io::Write that forwards to stdout and captures lines into the buffer.
pub struct TeeWriter;

impl Write for TeeWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        /* tracing_subscriber's fmt layer writes one whole formatted event per
        call, so a call is a line. */
        push_line(&String::from_utf8_lossy(buf));
        std::io::stdout().write_all(buf)?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        std::io::stdout().flush()
    }
}

/// MakeWriter for tracing_subscriber: hands out a fresh TeeWriter per event.
#[derive(Clone)]
pub struct TeeMakeWriter;

impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for TeeMakeWriter {
    type Writer = TeeWriter;

    fn make_writer(&'a self) -> Self::Writer {
        TeeWriter
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captures_and_caps_lines() {
        push_line("first line\n");
        push_line("");
        for i in 0..MAX_LINES + 10 {
            push_line(&format!("line {i}"));
        }
        let lines = recent_lines();
        assert_eq!(lines.len(), MAX_LINES);
        /* The oldest lines were dropped; the newest survive. */
        assert_eq!(lines.last().unwrap(), &format!("line {}", MAX_LINES + 9));
    }
}
