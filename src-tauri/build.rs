/*
 * Name: build.rs
 * Purpose: Tauri build script executed before compilation.
 * Description: tauri_build::build() generates the Tauri runtime glue code.
 *   This must exist for the Tauri app to compile correctly.
 * Tech Stack: Rust, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

fn main() {
    tauri_build::build();
}
