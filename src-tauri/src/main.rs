/*
 * Title: main.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Desktop application entry point. Bootstraps the Tauri runtime.
 * Important Details: The #![cfg_attr] attribute hides the console window on Windows
 *   release builds. All app configuration is delegated to lib.rs.
 */

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    notebooklab_lib::run();
}
