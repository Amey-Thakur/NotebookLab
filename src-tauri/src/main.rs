/*
 * Name: main.rs
 * Purpose: Desktop application entry point.
 * Description: Bootstraps the Tauri runtime. The #![cfg_attr] attribute hides
 *   the console window on Windows release builds. All app
 *   configuration is delegated to lib.rs.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    notebooklab_lib::run();
}
