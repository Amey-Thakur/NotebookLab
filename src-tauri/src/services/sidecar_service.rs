/*
 * Title: sidecar_service.rs
 * Tech Stack: Rust, Tauri v2 Shell Plugin
 * Description: Manages the llama-server sidecar lifecycle. Starts the process on
 *   an available port, monitors health, and provides status to the frontend.
 * Important Details: The sidecar runs as a child process managed by Tauri's shell
 *   plugin. A random port is chosen (OS-assigned) and a per-session API key is
 *   generated for auth. The frontend never contacts llama-server directly;
 *   all requests flow through Rust services.
 */

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;


/// Sidecar lifecycle states (stored as u8 for atomic access).
const STATE_STOPPED: u8 = 0;
const STATE_STARTING: u8 = 1;
const STATE_READY: u8 = 2;
const STATE_CRASHED: u8 = 3;
const STATE_STOPPING: u8 = 4;


/// Serializable state for the frontend.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SidecarState {
    Stopped,
    Starting,
    Ready,
    Crashed,
    Stopping,
}

impl From<u8> for SidecarState {
    fn from(v: u8) -> Self {
        match v {
            STATE_STOPPED => Self::Stopped,
            STATE_STARTING => Self::Starting,
            STATE_READY => Self::Ready,
            STATE_CRASHED => Self::Crashed,
            STATE_STOPPING => Self::Stopping,
            _ => Self::Stopped,
        }
    }
}


/// Thread-safe sidecar manager. Stored in Tauri managed state.
/// Tracks the running process, its port, and the API key.
pub struct SidecarManager {
    state: AtomicU8,
    port: Mutex<u16>,
    api_key: Mutex<String>,
    model_path: Mutex<String>,
    /// PID of the child process (0 if not running).
    pid: Mutex<u32>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            state: AtomicU8::new(STATE_STOPPED),
            port: Mutex::new(0),
            api_key: Mutex::new(String::new()),
            model_path: Mutex::new(String::new()),
            pid: Mutex::new(0),
        }
    }

    pub fn current_state(&self) -> SidecarState {
        SidecarState::from(self.state.load(Ordering::Acquire))
    }

    pub fn set_state(&self, state: u8) {
        self.state.store(state, Ordering::Release);
    }

    pub fn port(&self) -> u16 {
        *self.port.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn set_port(&self, port: u16) {
        *self.port.lock().unwrap_or_else(|e| e.into_inner()) = port;
    }

    pub fn api_key(&self) -> String {
        self.api_key.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn set_api_key(&self, key: String) {
        *self.api_key.lock().unwrap_or_else(|e| e.into_inner()) = key;
    }

    pub fn model_path(&self) -> String {
        self.model_path.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn set_model_path(&self, path: String) {
        *self.model_path.lock().unwrap_or_else(|e| e.into_inner()) = path;
    }

    pub fn pid(&self) -> u32 {
        *self.pid.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn set_pid(&self, pid: u32) {
        *self.pid.lock().unwrap_or_else(|e| e.into_inner()) = pid;
    }

    pub fn is_running(&self) -> bool {
        let s = self.state.load(Ordering::Acquire);
        s == STATE_STARTING || s == STATE_READY
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port())
    }
}


/// Serializable status for the frontend.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SidecarStatusInfo {
    pub state: SidecarState,
    pub port: u16,
    pub model_path: String,
    pub pid: u32,
}


/// Find an available TCP port by binding to port 0.
pub fn find_available_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(8090)
}


/// Generate a random API key for sidecar auth using UUID v7 (OS entropy).
pub fn generate_session_key() -> String {
    let key = uuid::Uuid::now_v7();
    format!("nbl-{}", key.simple())
}


/// Build the argument list for llama-server.
pub fn build_sidecar_args(port: u16, model_path: &str) -> Vec<String> {
    vec![
        "--port".to_string(),
        port.to_string(),
        "-m".to_string(),
        model_path.to_string(),
        /* Context window: 2048 tokens is reasonable for 3B models on 8GB RAM */
        "-c".to_string(),
        "2048".to_string(),
        /* Threads: use half of available cores */
        "-t".to_string(),
        (num_cpus().max(2) / 2).to_string(),
    ]
}


/// Get the environment variable key for passing the API key to llama-server.
pub fn api_key_env_var() -> &'static str {
    "LLAMA_API_KEY"
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


/// Poll /health until the server is ready or timeout expires.
/// Returns true if server became ready within the timeout.
pub fn wait_for_ready(port: u16, timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(timeout_secs);

    while start.elapsed() < timeout {
        if check_health(port) {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    false
}


/// Scan a directory for GGUF model files. Returns paths sorted by size (smallest first).
pub fn find_model_files(models_dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut models: Vec<std::path::PathBuf> = Vec::new();

    if let Ok(entries) = std::fs::read_dir(models_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("gguf") {
                models.push(path);
            }
        }
    }

    /* Sort smallest first so free-tier models are preferred */
    models.sort_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(u64::MAX));
    models
}


/// Get available CPU core count (fallback to 4 if detection fails).
fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}
