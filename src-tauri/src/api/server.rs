/*
 * Title: server.rs
 * Tech Stack: Rust, tiny_http, serde_json
 * Description: Local HTTP REST API server for external automation.
 * Important Details: Binds to 127.0.0.1:8484 (localhost only). Opens its own
 *   read-only SQLite connection to avoid contending with the main app's Mutex.
 *   WAL mode enables concurrent readers. Runs in a background thread.
 */

use std::path::PathBuf;
use std::thread;

use rusqlite::Connection;
use tiny_http::{Header, Method, Response, Server};

use crate::database::repository::{notebook_repository, note_repository, document_repository, chunk_repository};


const API_PORT: u16 = 8484;
const CONTENT_TYPE_JSON: &str = "application/json";


/// Start the REST API server in a background thread.
/// Opens its own read-only database connection (WAL mode allows concurrent readers).
/// Returns the session token required for API auth.
pub fn start_api_server(db_path: PathBuf) -> String {
    let api_token = format!("nbl-api-{}", uuid::Uuid::new_v4().simple());
    let token_for_thread = api_token.clone();

    thread::spawn(move || {
        let expected_auth = format!("Bearer {}", token_for_thread);
        let conn = match Connection::open_with_flags(
            &db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        ) {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("REST API: could not open database: {e}");
                return;
            }
        };

        let addr = format!("127.0.0.1:{API_PORT}");
        let server = match Server::http(&addr) {
            Ok(s) => {
                tracing::info!("REST API server running at http://{addr}");
                s
            }
            Err(e) => {
                tracing::warn!("Could not start REST API server: {e}");
                return;
            }
        };

        for request in server.incoming_requests() {
            /* Verify bearer token (skip for /api/health which is public) */
            let path = request.url().split('?').next().unwrap_or("/");
            if path != "/api/health" {
                let auth_ok = request.headers().iter().any(|h| {
                    h.field.as_str() == "Authorization"
                        && h.value.as_str() == expected_auth
                });
                if !auth_ok {
                    let header = Header::from_bytes("Content-Type", CONTENT_TYPE_JSON).unwrap();
                    let body = serde_json::json!({"error": "Unauthorized"}).to_string();
                    let r = Response::from_string(body)
                        .with_status_code(401)
                        .with_header(header);
                    request.respond(r).ok();
                    continue;
                }
            }

            let response = handle_request(&request, &conn);

            let header = Header::from_bytes("Content-Type", CONTENT_TYPE_JSON).unwrap();

            match response {
                Ok(body) => {
                    let r = Response::from_string(body).with_header(header);
                    request.respond(r).ok();
                }
                Err(msg) => {
                    let error_json = serde_json::json!({ "error": msg }).to_string();
                    let r = Response::from_string(error_json)
                        .with_status_code(400)
                        .with_header(header);
                    request.respond(r).ok();
                }
            }
        }
    });

    api_token
}


fn handle_request(
    request: &tiny_http::Request,
    conn: &Connection,
) -> Result<String, String> {
    let path = request.url().split('?').next().unwrap_or("/");
    let method = request.method();

    match (method, path) {
        (&Method::Get, "/api/health") => {
            Ok(serde_json::json!({
                "status": "ok",
                "version": env!("CARGO_PKG_VERSION"),
                "api_port": API_PORT
            }).to_string())
        }

        (&Method::Get, "/api/notebooks") => {
            let notebooks = notebook_repository::list_all(conn).map_err(|e| e.to_string())?;
            serde_json::to_string(&notebooks).map_err(|e| e.to_string())
        }

        (&Method::Get, p) if p.starts_with("/api/notebooks/") && p.ends_with("/notes") => {
            let notebook_id = p.strip_prefix("/api/notebooks/")
                .and_then(|s| s.strip_suffix("/notes"))
                .unwrap_or("");
            let notes = note_repository::list_by_notebook(conn, notebook_id).map_err(|e| e.to_string())?;
            serde_json::to_string(&notes).map_err(|e| e.to_string())
        }

        (&Method::Get, p) if p.starts_with("/api/notebooks/") && p.ends_with("/documents") => {
            let notebook_id = p.strip_prefix("/api/notebooks/")
                .and_then(|s| s.strip_suffix("/documents"))
                .unwrap_or("");
            let docs = document_repository::list_by_notebook(conn, notebook_id).map_err(|e| e.to_string())?;
            serde_json::to_string(&docs).map_err(|e| e.to_string())
        }

        (&Method::Get, p) if p.starts_with("/api/documents/") && p.ends_with("/chunks") => {
            let doc_id = p.strip_prefix("/api/documents/")
                .and_then(|s| s.strip_suffix("/chunks"))
                .unwrap_or("");
            let chunks = chunk_repository::get_by_document(conn, doc_id).map_err(|e| e.to_string())?;
            serde_json::to_string(&chunks).map_err(|e| e.to_string())
        }

        (&Method::Get, "/api/chunks/count") => {
            let count = chunk_repository::count_all(conn).map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "count": count }).to_string())
        }

        _ => Err(format!("Not found: {} {}", method, path)),
    }
}
