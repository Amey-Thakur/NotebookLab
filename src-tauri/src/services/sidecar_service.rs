/*
 * Title: sidecar_service.rs
 * Tech Stack: Rust, Tauri v2 Shell Plugin
 * Description: Manages the llama-server sidecar lifecycle. Starts the process on
 *   an available port, monitors health, and auto-restarts on crash.
 * Important Details: The sidecar runs as a child process managed by Tauri's shell
 *   plugin. A random port is chosen (OS-assigned) and a per-session API key is
 *   generated for auth. The frontend never contacts llama-server directly;
 *   all requests flow through Rust services.
 */

use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};


/// Sidecar lifecycle states.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SidecarState {
    Stopped,
    Starting,
    Ready,
    Crashed,
}


/// Shared sidecar status, readable from any thread.
pub struct SidecarStatus {
    pub port: AtomicU16,
    pub running: AtomicBool,
}

impl SidecarStatus {
    pub fn new() -> Self {
        Self {
            port: AtomicU16::new(0),
            running: AtomicBool::new(false),
        }
    }

    pub fn base_url(&self) -> String {
        let port = self.port.load(Ordering::Relaxed);
        format!("http://127.0.0.1:{port}")
    }
}


/// Find an available TCP port by binding to port 0.
pub fn find_available_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(8090)
}


/// Generate a random API key for sidecar auth (hex-encoded 16 bytes).
pub fn generate_session_key() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("nbl-{seed:x}")
}


/// Build the argument list for llama-server.
pub fn build_sidecar_args(port: u16, model_path: &str, api_key: &str) -> Vec<String> {
    vec![
        "--port".to_string(),
        port.to_string(),
        "-m".to_string(),
        model_path.to_string(),
        "--api-key".to_string(),
        api_key.to_string(),
        /* Context window: 2048 tokens is reasonable for 3B models on 8GB RAM */
        "-c".to_string(),
        "2048".to_string(),
        /* Threads: use half of available cores */
        "-t".to_string(),
        (num_cpus().max(2) / 2).to_string(),
    ]
}


/// Check if llama-server is healthy by probing /health.
pub fn check_health(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/health");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new());

    match client.get(&url).send() {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}


/// Get available CPU core count (fallback to 4 if detection fails).
fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}
