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

use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Mutex;

use tauri_plugin_shell::process::CommandChild;

/// Sidecar lifecycle states (stored as u8 for atomic access).
pub const STATE_STOPPED: u8 = 0;
pub const STATE_STARTING: u8 = 1;
pub const STATE_READY: u8 = 2;
pub const STATE_CRASHED: u8 = 3;
pub const STATE_STOPPING: u8 = 4;

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
/// Uses a single Mutex for all mutable fields to prevent partial-update reads.
pub struct SidecarManager {
    state: AtomicU8,
    inner: Mutex<SidecarInner>,
    /// Shared cancellation flag: set to true when the process exits.
    /// The health-polling thread checks this to abort early instead of
    /// waiting the full 120s timeout on a dead process.
    pub cancelled: AtomicBool,
    /// Handle to the spawned llama-server process. Held so the app can kill
    /// the child on stop and on exit; without it the server outlives the app.
    child: Mutex<Option<CommandChild>>,
}

pub struct SidecarInner {
    pub port: u16,
    pub api_key: String,
    pub model_path: String,
    pub pid: u32,
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            state: AtomicU8::new(STATE_STOPPED),
            inner: Mutex::new(SidecarInner {
                port: 0,
                api_key: String::new(),
                model_path: String::new(),
                pid: 0,
            }),
            cancelled: AtomicBool::new(false),
            child: Mutex::new(None),
        }
    }

    /// Store the spawned child process handle.
    pub fn set_child(&self, child: CommandChild) {
        let mut guard = self.child.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(child);
    }

    /// Take the child process handle, leaving None behind.
    pub fn take_child(&self) -> Option<CommandChild> {
        let mut guard = self.child.lock().unwrap_or_else(|e| e.into_inner());
        guard.take()
    }

    /// Terminate the sidecar process and reset all state. Safe to call from
    /// any state, including Crashed. Used by the stop command and app exit.
    pub fn shutdown(&self) {
        self.cancelled.store(true, Ordering::Release);

        if let Some(child) = self.take_child() {
            let pid = child.pid();
            if let Err(e) = child.kill() {
                tracing::warn!("Failed to kill llama-server (PID {pid}): {e}");
            } else {
                tracing::info!("llama-server stopped (PID {pid})");
            }
        }

        self.set_state(STATE_STOPPED);
        self.clear();
    }

    pub fn current_state(&self) -> SidecarState {
        SidecarState::from(self.state.load(Ordering::Acquire))
    }

    pub fn set_state(&self, state: u8) {
        self.state.store(state, Ordering::Release);
    }

    /// Atomically transition from expected_state to new_state.
    /// Returns true if the transition succeeded (was in expected_state).
    pub fn try_transition(&self, expected: u8, new: u8) -> bool {
        self.state
            .compare_exchange(expected, new, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }

    pub fn port(&self) -> u16 {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).port
    }

    pub fn api_key(&self) -> String {
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .api_key
            .clone()
    }

    pub fn model_path(&self) -> String {
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .model_path
            .clone()
    }

    pub fn pid(&self) -> u32 {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).pid
    }

    /// Set all mutable fields atomically under one lock.
    pub fn configure(&self, port: u16, api_key: String, model_path: String, pid: u32) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        inner.port = port;
        inner.api_key = api_key;
        inner.model_path = model_path;
        inner.pid = pid;
    }

    /// Clear all fields on stop.
    pub fn clear(&self) {
        self.configure(0, String::new(), String::new(), 0);
    }

    /// Direct access to inner fields for commands that need to update PID after spawn.
    pub fn inner_lock(&self) -> std::sync::MutexGuard<'_, SidecarInner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
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

/// Generate a random API key for sidecar auth using UUID v4 (122 bits of randomness).
pub fn generate_session_key() -> String {
    let key = uuid::Uuid::new_v4();
    format!("nbl-{}", key.simple())
}

/// Build the argument list for llama-server.
/// --embeddings enables the /v1/embeddings endpoint so the same local model
/// powers semantic search without any extra download.
pub fn build_sidecar_args(port: u16, model_path: &str) -> Vec<String> {
    vec![
        "--port".to_string(),
        port.to_string(),
        "-m".to_string(),
        model_path.to_string(),
        "-c".to_string(),
        "2048".to_string(),
        "-t".to_string(),
        (num_cpus().max(2) / 2).to_string(),
        "--embeddings".to_string(),
    ]
}

/// Directories that may hold llama-server's shared libraries, joined into a
/// search-path value for the child process environment. The release archives
/// ship llama-server together with its DLLs / dylibs / .so files; installers
/// place them under the resource directory, while dev builds read them from
/// src-tauri/binaries/libs.
pub fn library_search_path(resource_dir: Option<std::path::PathBuf>) -> String {
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();

    if let Some(dir) = resource_dir {
        dirs.push(dir.join("llama-libs"));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            dirs.push(exe_dir.to_path_buf());
        }
    }

    /* Dev fallback: the download script drops libraries next to the binary */
    if cfg!(debug_assertions) {
        dirs.push(
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries")
                .join("libs"),
        );
    }

    let sep = if cfg!(windows) { ";" } else { ":" };
    dirs.iter()
        .filter(|d| d.exists())
        .map(|d| d.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(sep)
}

/// Environment variables needed for the sidecar to find its shared libraries.
/// Windows resolves DLLs via PATH, Linux via LD_LIBRARY_PATH, and macOS via
/// DYLD_FALLBACK_LIBRARY_PATH (fallback so system paths keep working).
pub fn library_env(resource_dir: Option<std::path::PathBuf>) -> Vec<(String, String)> {
    let lib_path = library_search_path(resource_dir);
    if lib_path.is_empty() {
        return Vec::new();
    }

    if cfg!(windows) {
        let existing = std::env::var("PATH").unwrap_or_default();
        vec![("PATH".to_string(), format!("{lib_path};{existing}"))]
    } else if cfg!(target_os = "macos") {
        vec![("DYLD_FALLBACK_LIBRARY_PATH".to_string(), lib_path)]
    } else {
        let existing = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
        let value = if existing.is_empty() {
            lib_path
        } else {
            format!("{lib_path}:{existing}")
        };
        vec![("LD_LIBRARY_PATH".to_string(), value)]
    }
}

/// Get the environment variable key for passing the API key to llama-server.
pub fn api_key_env_var() -> &'static str {
    "LLAMA_API_KEY"
}

/// Check if llama-server is healthy by probing /health.
pub fn check_health_with_client(client: &reqwest::blocking::Client, port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/health");
    match client.get(&url).send() {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// Poll /health until the server is ready, cancelled, or timeout expires.
/// The `cancelled` flag is set by the stdout-reader thread when the process exits,
/// so the poller aborts immediately instead of waiting the full timeout.
pub fn wait_for_ready(port: u16, timeout_secs: u64, cancelled: &AtomicBool) -> bool {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(timeout_secs);

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_else(|_| reqwest::blocking::Client::new());

    while start.elapsed() < timeout {
        /* Abort early if the process has already exited */
        if cancelled.load(Ordering::Acquire) {
            tracing::debug!("Health poll aborted: process exited");
            return false;
        }

        if check_health_with_client(&client, port) {
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

    models.sort_by_key(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(u64::MAX));
    models
}

/// Validate that a model path is within the allowed models directory.
/// Prevents path traversal attacks via user-supplied model_path.
pub fn validate_model_path(model: &std::path::Path, allowed_dir: &std::path::Path) -> bool {
    /* Canonicalize both paths to resolve symlinks and ../ components */
    let canonical_model = match std::fs::canonicalize(model) {
        Ok(p) => p,
        Err(_) => return false,
    };
    let canonical_dir = match std::fs::canonicalize(allowed_dir) {
        Ok(p) => p,
        Err(_) => return false,
    };

    canonical_model.starts_with(canonical_dir)
}

/// Get available CPU core count (fallback to 4 if detection fails).
fn num_cpus() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
}
