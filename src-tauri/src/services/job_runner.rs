/*
 * Name: job_runner.rs
 * Purpose: Run a grounded generation as a tracked job, with honest progress.
 * Description: Every AI feature had the same shape: read passages from the
 *   notebook, build a prompt, call the model, return the text. Each did it as
 *   one blocking command the frontend awaited, so the work belonged to a React
 *   component. Navigating away dropped the result, and a local model that
 *   needed minutes looked identical to a hang.
 *
 *   This runs that shape once, for all of them. The command registers a job and
 *   returns its id immediately; the work continues here on a worker thread and
 *   reports weighted phases, so the percentage means something and the job is
 *   still there when the user comes back.
 *
 *   The model call has no token stream to measure, so the generate phase is
 *   advanced against how long generation has actually taken on this machine
 *   with this model (see `JobRegistry::expected_generate_secs`). That is an
 *   estimate, and it is treated as one: the bar is capped short of full until
 *   the call genuinely returns, so it can run late but never claims to be
 *   finished when it is not.
 * Tech Stack: Rust, Tauri v2, std::thread
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::providers::{ChatMessage, ChatRequest, MessageRole, TaskPurpose};
use crate::services::job_service::{
    JobHandle, PHASE_FINALIZE, PHASE_GENERATE, PHASE_PROMPT, PHASE_SOURCES,
};
use crate::state::AppState;

/// How often the generate phase re-reports while the model call is in flight.
/// Fast enough that the bar visibly moves, slow enough not to flood the webview
/// with events during a call that can run for minutes.
const TICK: Duration = Duration::from_millis(600);

/// The furthest the generate phase will advance on estimate alone. Reaching the
/// end of the phase is reserved for the call actually returning; a bar that sits
/// at 100% while the user keeps waiting is the exact failure this replaces.
const ESTIMATE_CEILING: f32 = 0.95;

/// What to generate, and how to label it while it runs.
pub struct Generation {
    /// Feature family, e.g. "audio" or "studio". The frontend routes a finished
    /// result by this.
    pub kind: &'static str,
    /// Short human label shown next to the bar, e.g. "Debate".
    pub label: String,
    pub notebook_id: String,
    pub system_prompt: String,
    pub max_tokens: u32,
    pub temperature: f32,
    pub purpose: TaskPurpose,
}

/// Read the grounding passages. Called with the database lock held, so it should
/// do no network work and return promptly.
pub type Gather = Box<dyn FnOnce(&Connection) -> AppResult<String> + Send>;

/// Turn the gathered context into the user message.
pub type Compose = Box<dyn FnOnce(&str) -> String + Send>;

/// Post-process the model's reply. Returning an error fails the job with that
/// message, which is how a feature rejects an unusable response.
pub type Finish = Box<dyn FnOnce(String) -> AppResult<String> + Send>;

/// Start a generation and return its job id at once.
///
/// The caller does not wait. Progress, the result and any error all arrive
/// through the job, which the frontend is already subscribed to.
pub fn spawn(
    app: &AppHandle,
    spec: Generation,
    gather: Gather,
    compose: Compose,
    finish: Finish,
) -> AppResult<String> {
    let state: tauri::State<'_, AppState> = app.state();
    let mut handle = state
        .jobs
        .start(app, spec.kind, &spec.notebook_id, &spec.label)?;
    let job_id = handle.id.clone();

    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state: tauri::State<'_, AppState> = app.state();
        let jobs = &state.jobs;

        /* Each phase is attempted in turn; the first failure ends the job with a
        message the user can act on, rather than a silent stop. */
        let outcome = (|| -> AppResult<String> {
            handle.begin(jobs, PHASE_SOURCES);
            let context = {
                let conn = state.conn()?;
                gather(&conn)?
            };
            handle.finish_phase(jobs, PHASE_SOURCES);
            if handle.cancelled() {
                return Err(AppError::Internal(CANCELLED.into()));
            }

            handle.begin(jobs, PHASE_PROMPT);
            let user_content = compose(&context);
            handle.finish_phase(jobs, PHASE_PROMPT);
            if handle.cancelled() {
                return Err(AppError::Internal(CANCELLED.into()));
            }

            handle.begin(jobs, PHASE_GENERATE);
            let providers = state.provider_read()?;
            /* Key the expectation by the model actually about to answer, so a
            switch from a small local model to a large one is learned rather
            than averaged into one meaningless number. */
            let (key, is_local) = providers.active_profile();
            let expected = jobs.expected_generate_secs(&key, is_local);

            let started = Instant::now();
            let ticker = Ticker::start(&app, &handle, expected);
            let response = providers
                .chat_completion(ChatRequest {
                    messages: vec![
                        ChatMessage {
                            role: MessageRole::System,
                            content: spec.system_prompt,
                        },
                        ChatMessage {
                            role: MessageRole::User,
                            content: user_content,
                        },
                    ],
                    max_tokens: Some(spec.max_tokens),
                    temperature: Some(spec.temperature),
                    purpose: spec.purpose,
                })
                .map_err(|e| AppError::Provider(e.to_string()));
            ticker.stop();
            drop(providers);

            let response = response?;
            jobs.record_generate_secs(&key, started.elapsed().as_secs_f32());
            handle.finish_phase(jobs, PHASE_GENERATE);

            handle.begin(jobs, PHASE_FINALIZE);
            let finished = finish(response.content)?;
            handle.finish_phase(jobs, PHASE_FINALIZE);
            Ok(finished)
        })();

        match outcome {
            Ok(result) => handle.succeed(jobs, result),
            /* A cancel beats whatever error the early return carried: the user
            stopping the work is not a failure to report back to them. */
            Err(_) if handle.cancelled() => handle.cancel(jobs),
            Err(e) => handle.fail(jobs, e.to_string()),
        }
    });

    Ok(job_id)
}

/// Marker for the early return taken when the user cancels between phases. It
/// never reaches the user: the match on the outcome turns it into a cancelled
/// job, which the frontend renders as such.
const CANCELLED: &str = "cancelled";

/// Advances the generate phase on a timer while the model call blocks.
struct Ticker {
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Ticker {
    fn start(app: &AppHandle, handle: &JobHandle, expected: f32) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&stop);
        let app = app.clone();
        let id = handle.id.clone();
        let banked = handle.done_weight();

        let thread = std::thread::spawn(move || {
            let started = Instant::now();
            while !flag.load(Ordering::SeqCst) {
                std::thread::sleep(TICK);
                if flag.load(Ordering::SeqCst) {
                    break;
                }
                let within =
                    (started.elapsed().as_secs_f32() / expected.max(1.0)).min(ESTIMATE_CEILING);
                let state: tauri::State<'_, AppState> = app.state();
                state.jobs.report(&app, &id, PHASE_GENERATE, banked, within);
            }
        });

        Self {
            stop,
            thread: Some(thread),
        }
    }

    fn stop(mut self) {
        self.halt();
    }

    fn halt(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(t) = self.thread.take() {
            t.join().ok();
        }
    }
}

impl Drop for Ticker {
    /// Stops the thread even when the generate phase returns early through the
    /// `?` on the provider error, so a failed call cannot leave a thread
    /// reporting progress for a job that is already over.
    fn drop(&mut self) {
        self.halt();
    }
}
