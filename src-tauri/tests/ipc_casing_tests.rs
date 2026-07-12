/*
 * Name: ipc_casing_tests.rs
 * Purpose: Guards the IPC argument-casing contract between the frontend and
 *   the Tauri commands.
 * Description: The frontend sends snake_case argument keys everywhere
 *   (matching the snake_case wire format of all response models).
 *   Tauri v2 maps command arguments to camelCase by default, which
 *   silently breaks every multi-word argument at runtime; CI
 *   cannot catch that through unit tests because vitest mocks
 *   invoke() and cargo never runs the webview. This test therefore
 *   enforces that every #[tauri::command] declares rename_all =
 *   "snake_case".
 * Tech Stack: Rust, integration tests
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

use std::path::PathBuf;

#[test]
fn every_command_uses_snake_case_arguments() {
    let commands_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("src")
        .join("commands");

    let mut checked_files = 0;
    let mut violations: Vec<String> = Vec::new();

    for entry in std::fs::read_dir(&commands_dir).expect("commands directory exists") {
        let path = entry.expect("readable dir entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("rs") {
            continue;
        }

        let source = std::fs::read_to_string(&path).expect("readable command source");
        let file_name = path.file_name().unwrap().to_string_lossy().to_string();
        checked_files += 1;

        for (line_number, line) in source.lines().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with("#[tauri::command")
                && !trimmed.contains("rename_all = \"snake_case\"")
            {
                violations.push(format!("{file_name}:{}", line_number + 1));
            }
        }
    }

    assert!(
        checked_files > 0,
        "No command files found; did the layout change?"
    );
    assert!(
        violations.is_empty(),
        "Commands missing rename_all = \"snake_case\" (frontend sends snake_case keys): {}",
        violations.join(", ")
    );
}
