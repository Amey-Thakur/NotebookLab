/*
 * Title: lib.rs
 * Tech Stack: Rust, Tauri v2, SQLite
 * Description: Application builder. Registers all plugins, managed state, and command handlers.
 * Important Details: This is the central wiring point for the entire backend. Every module
 *   is registered here. State (database pool, model handles) is injected via app.manage().
 *   Commands are registered via invoke_handler(). Plugins extend Tauri's capabilities.
 */

mod commands;
mod database;
mod error;
mod parsers;
mod providers;
mod services;
mod state;
mod utils;

use state::AppState;


/// Build and run the Tauri application.
/// Called from main.rs on desktop, or from a test harness.
pub fn run() {
    let log_filter = if cfg!(debug_assertions) {
        "notebooklab=debug,tauri=info"
    } else {
        "notebooklab=info,tauri=warn"
    };

    tracing_subscriber::fmt()
        .with_env_filter(log_filter)
        .init();

    tracing::info!("Starting NotebookLab v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        /* Shell plugin deferred until sidecar (llama.cpp) is implemented */
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_state = AppState::initialize(app.handle())?;
            app.manage(app_state);

            tracing::info!("Application state initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system_commands::get_app_version,
            commands::system_commands::get_data_directory,
            commands::system_commands::health_check,
            commands::notebook_commands::list_notebooks,
            commands::notebook_commands::get_notebook,
            commands::notebook_commands::create_notebook,
            commands::notebook_commands::update_notebook,
            commands::notebook_commands::delete_notebook,
            commands::note_commands::list_notes,
            commands::note_commands::get_note,
            commands::note_commands::create_note,
            commands::note_commands::update_note,
            commands::note_commands::delete_note,
            commands::note_commands::search_notes,
            commands::document_commands::import_document,
            commands::document_commands::list_documents,
            commands::document_commands::get_document,
            commands::document_commands::delete_document,
            commands::document_commands::get_document_chunks,
            commands::document_commands::get_chunk_count,
            commands::chat_commands::start_chat,
            commands::chat_commands::send_chat_message,
            commands::chat_commands::list_conversations,
            commands::chat_commands::get_chat_messages,
            commands::chat_commands::delete_conversation,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| {
            tracing::error!("Failed to run NotebookLab: {e}");
            eprintln!("Fatal error: {e}");
        });
}
