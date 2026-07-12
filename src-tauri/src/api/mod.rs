/*
 * Name: mod.rs
 * Purpose: Local REST API server for external automation and scripting.
 * Description: Runs on localhost:8484 in a background thread. Provides JSON
 *   endpoints that mirror the Tauri IPC commands. Only binds to
 *   127.0.0.1 (not 0.0.0.0) so it is not accessible from the
 *   network. The server is optional and can be disabled via
 *   settings.
 * Tech Stack: Rust, tiny_http
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

pub mod server;
