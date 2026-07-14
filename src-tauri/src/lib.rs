/*
 * Name: lib.rs
 * Purpose: Application builder.
 * Description: Registers all plugins, managed state, and command handlers.
 *   This is the central wiring point for the entire backend. Every
 *   module is registered here. State (database pool, model
 *   handles) is injected via app.manage(). Commands are registered
 *   via invoke_handler(). Plugins extend Tauri's capabilities.
 * Tech Stack: Rust, Tauri v2, SQLite
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

pub mod api;
pub mod commands;
pub mod database;
pub mod error;
pub mod parsers;
pub mod providers;
pub mod services;
pub mod state;
pub mod utils;

use tauri::Manager;

use services::sidecar_service::SidecarManager;
use state::AppState;

/// Build and run the Tauri application.
/// Called from main.rs on desktop, or from a test harness.
pub fn run() {
    let log_filter = if cfg!(debug_assertions) {
        "notebooklab=debug,tauri=info"
    } else {
        "notebooklab=info,tauri=warn"
    };

    tracing_subscriber::fmt().with_env_filter(log_filter).init();

    tracing::info!("Starting NotebookLab v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_state = AppState::initialize(app.handle())?;

            /* Create sample notebook on first run */
            if let Ok(conn) = app_state.conn() {
                services::first_run_service::ensure_sample_notebook(&conn)
                    .unwrap_or_else(|e| tracing::warn!("First-run setup failed: {e}"));
            }

            /* Start the local REST API server with its own read-only DB
            connection. It shares the session token stored in AppState so
            the Settings page can show users how to authenticate. */
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to resolve data dir: {e}"))?;
            let db_path = data_dir.join("notebooklab.db");
            api::server::start_api_server(db_path, app_state.api_token.clone());

            app.manage(app_state);
            app.manage(SidecarManager::new());

            /* Auto-detect local LLM providers on a background thread.
            Runs after manage() so state is accessible via Tauri's Arc wrapper.
            This avoids blocking the UI (up to 1.5s if all probes timeout). */
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let state: tauri::State<'_, AppState> = handle.state();
                if let Ok(mut providers) = state.provider_write() {
                    services::auto_setup_service::auto_detect_providers(&mut providers);
                };
            });

            /* Check for updates in the background. When a new version has
            been downloaded and staged, the status bar offers a restart;
            registering the plugin alone never checks anything. */
            let update_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri::Emitter;
                use tauri_plugin_updater::UpdaterExt;

                let Ok(updater) = update_handle.updater() else {
                    return;
                };
                match updater.check().await {
                    Ok(Some(update)) => {
                        let version = update.version.clone();
                        tracing::info!("Update available: v{version}");
                        if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                            update_handle.emit("update-ready", version).ok();
                        }
                    }
                    Ok(None) => tracing::debug!("App is up to date"),
                    Err(e) => tracing::debug!("Update check skipped: {e}"),
                }
            });

            tracing::info!("Application state initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system_commands::get_app_version,
            commands::system_commands::get_data_directory,
            commands::system_commands::get_api_token,
            commands::system_commands::restart_app,
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
            commands::note_commands::get_backlinks,
            commands::note_commands::resolve_wiki_link,
            commands::note_commands::export_note,
            commands::note_commands::list_recent_notes,
            commands::note_commands::get_notes_graph,
            commands::canvas_commands::get_or_create_canvas,
            commands::canvas_commands::update_canvas,
            commands::share_commands::export_notebook,
            commands::share_commands::import_notebook,
            commands::document_commands::import_document,
            commands::document_commands::list_documents,
            commands::document_commands::delete_document,
            commands::document_commands::get_document_chunks,
            commands::document_commands::get_chunk_count,
            commands::chat_commands::start_chat,
            commands::chat_commands::send_chat_message,
            commands::chat_commands::list_conversations,
            commands::chat_commands::get_chat_messages,
            commands::chat_commands::get_message_citations,
            commands::chat_commands::delete_conversation,
            commands::search_commands::search,
            commands::thinking_commands::generate_mind_map,
            commands::thinking_commands::generate_socratic_questions,
            commands::studio_commands::generate_studio,
            commands::transform_commands::transform_document,
            commands::prompt_commands::craft_prompt,
            commands::model_commands::list_providers,
            commands::model_commands::register_provider,
            commands::model_commands::set_active_provider,
            commands::model_commands::get_active_provider_name,
            commands::model_commands::detect_providers,
            commands::podcast_commands::generate_podcast,
            commands::download_commands::download_default_model,
            commands::download_commands::has_local_model,
            commands::sidecar_commands::sidecar_available,
            commands::sidecar_commands::get_sidecar_status,
            commands::sidecar_commands::start_sidecar,
            commands::sidecar_commands::stop_sidecar,
            commands::sidecar_commands::list_local_models,
        ])
        .build(tauri::generate_context!())
        .map(|app| {
            app.run(|app_handle, event| {
                /* Terminate the llama-server child on exit so it never
                outlives the app as an orphaned process. try_state: if setup
                failed before manage(), there is nothing to clean up. */
                if let tauri::RunEvent::Exit = event {
                    if let Some(sidecar) = app_handle.try_state::<SidecarManager>() {
                        sidecar.shutdown();
                    }
                }
            });
        })
        .unwrap_or_else(|e| {
            tracing::error!("Failed to run NotebookLab: {e}");
            eprintln!("Fatal error: {e}");
        });
}
