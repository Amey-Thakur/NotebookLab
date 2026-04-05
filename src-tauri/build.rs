/*
 * Title: build.rs
 * Tech Stack: Rust, Tauri v2
 * Description: Tauri build script executed before compilation.
 * Important Details: tauri_build::build() generates the Tauri runtime glue code.
 *   This must exist for the Tauri app to compile correctly.
 */

fn main() {
    tauri_build::build();
}
