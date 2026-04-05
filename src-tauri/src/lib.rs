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
mod providers;
mod services;
mod state;
mod utils;

use state::AppState;


/// Build and run the Tauri application.
/// Called from main.rs on desktop, or from a test harness.
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("notebooklab=debug,tauri=info")
        .init();

    tracing::info!("Starting NotebookLab v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run NotebookLab");
}
