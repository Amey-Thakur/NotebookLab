/*
 * Title: api/mod.rs
 * Tech Stack: Rust, tiny_http
 * Description: Local REST API server for external automation and scripting.
 * Important Details: Runs on localhost:8484 in a background thread. Provides
 *   JSON endpoints that mirror the Tauri IPC commands. Only binds to 127.0.0.1
 *   (not 0.0.0.0) so it is not accessible from the network.
 *   The server is optional and can be disabled via settings.
 */

pub mod server;
