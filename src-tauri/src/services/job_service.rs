/*
 * Name: job_service.rs
 * Purpose: Run long AI work as tracked background jobs with real progress.
 * Description: Every AI feature used to be a single blocking command. The
 *   frontend awaited it, the window showed a spinner with no end, and a local
 *   model that needed four minutes hit the request timeout and surfaced as
 *   "the model did not answer in time" after the user had already waited. The
 *   work was also lost the moment they navigated away, because the promise
 *   belonged to a component.
 *
 *   A job fixes all three. The command registers a job, returns its id at once,
 *   and the work continues on a worker thread. Progress is reported as weighted
 *   phases so the percentage means something (reading sources is genuinely a
 *   tenth of the work, generating is most of it), and an estimate is derived
 *   from elapsed time against the fraction done rather than guessed. State
 *   lives here, not in a component, so a job survives navigation and the
 *   frontend can rejoin it at any point.
 * Tech Stack: Rust, Tauri events, std::sync
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

/// The event every running job reports on. One channel for all of them, so the
/// frontend subscribes once and routes by id.
pub const JOB_EVENT: &str = "job-progress";

/// How many finished jobs to keep. Enough that a user who starts something,
/// works elsewhere and comes back still finds it; small enough that a long
/// session cannot grow without bound.
const HISTORY_LIMIT: usize = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Running,
    Done,
    Failed,
    Cancelled,
}

/// A unit of work the user started and can watch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    /// What kind of work this is, e.g. "audio" or "studio". The frontend uses
    /// it to decide where a finished result belongs.
    pub kind: String,
    /// The notebook this belongs to, so a job can be shown in context.
    pub notebook_id: String,
    /// Short human label, e.g. "Debate". Shown next to the bar.
    pub label: String,
    pub status: JobStatus,
    /// What is happening right now, in words the user can read.
    pub phase: String,
    /// 0 to 100. Weighted across phases so it advances at an honest rate.
    pub percent: u8,
    /// Seconds remaining, once there is enough signal to estimate. `None` early
    /// on, because a number invented in the first second is worse than none.
    pub eta_seconds: Option<u64>,
    pub result: Option<String>,
    pub error: Option<String>,
    /// Milliseconds since the job started, so the frontend can show elapsed
    /// time without holding its own timer.
    pub elapsed_ms: u64,
}

/// The phases a generation moves through, and what share of the work each is.
///
/// The weights are not decoration. Reading sources and embedding a query are
/// fast and bounded; the model call is the part that takes minutes. Splitting
/// evenly would race to 75% and then sit still, which is the specific thing
/// that makes a progress bar feel like a lie.
#[derive(Debug, Clone, Copy)]
pub struct Phase {
    pub label: &'static str,
    pub weight: f32,
}

pub const PHASE_SOURCES: Phase = Phase {
    label: "Reading your sources",
    weight: 0.12,
};
pub const PHASE_PROMPT: Phase = Phase {
    label: "Preparing the request",
    weight: 0.05,
};
pub const PHASE_GENERATE: Phase = Phase {
    label: "Generating",
    weight: 0.78,
};
pub const PHASE_FINALIZE: Phase = Phase {
    label: "Finishing up",
    weight: 0.05,
};

struct Entry {
    job: Job,
    started: Instant,
    cancel: Arc<AtomicBool>,
}

/// Every job this session, running and recent.
#[derive(Default)]
pub struct JobRegistry {
    entries: Mutex<HashMap<String, Entry>>,
    /// Insertion order, so trimming drops the oldest finished job first.
    order: Mutex<Vec<String>>,
    /// How long generation has actually taken on this machine, keyed by model.
    /// See `expected_generate_secs`.
    expectations: Mutex<HashMap<String, f32>>,
}

/// Weight given to the newest measurement when updating an expectation. Low
/// enough that one unusually slow run does not dominate, high enough that
/// switching from a 3B model to a 20B one is reflected within a few runs.
const EXPECTATION_ALPHA: f32 = 0.3;

/// First guess at how long a generation takes, before this machine has told us
/// otherwise. A local model on a CPU is the slow case and the one where a
/// missing progress bar hurts most, so it gets the longer default.
pub const DEFAULT_LOCAL_GENERATE_SECS: f32 = 75.0;
pub const DEFAULT_CLOUD_GENERATE_SECS: f32 = 12.0;

impl JobRegistry {
    /// How long the model call is expected to take, in seconds.
    ///
    /// There is no token stream to measure against, so the generate phase has no
    /// signal of its own while it runs. Rather than leave the bar frozen for
    /// minutes, progress is advanced against this expectation, which starts as a
    /// default and is corrected by what actually happened on this machine with
    /// this model. It is an estimate and the code treats it as one: the bar is
    /// capped short of full until the call really returns.
    pub fn expected_generate_secs(&self, key: &str, is_local: bool) -> f32 {
        let fallback = if is_local {
            DEFAULT_LOCAL_GENERATE_SECS
        } else {
            DEFAULT_CLOUD_GENERATE_SECS
        };
        self.expectations
            .lock()
            .ok()
            .and_then(|m| m.get(key).copied())
            .unwrap_or(fallback)
    }

    /// Fold a completed generation into the expectation for that model.
    pub fn record_generate_secs(&self, key: &str, secs: f32) {
        if !secs.is_finite() || secs <= 0.0 {
            return;
        }
        if let Ok(mut m) = self.expectations.lock() {
            let updated = match m.get(key) {
                Some(prev) => prev * (1.0 - EXPECTATION_ALPHA) + secs * EXPECTATION_ALPHA,
                None => secs,
            };
            m.insert(key.to_string(), updated);
        }
    }
}

impl JobRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a job and return a handle the worker reports through.
    pub fn start(
        &self,
        app: &AppHandle,
        kind: &str,
        notebook_id: &str,
        label: &str,
    ) -> AppResult<JobHandle> {
        let id = format!("job-{}", Uuid::new_v4().simple());
        let cancel = Arc::new(AtomicBool::new(false));
        let job = Job {
            id: id.clone(),
            kind: kind.to_string(),
            notebook_id: notebook_id.to_string(),
            label: label.to_string(),
            status: JobStatus::Running,
            phase: "Starting".into(),
            percent: 0,
            eta_seconds: None,
            result: None,
            error: None,
            elapsed_ms: 0,
        };

        {
            let mut entries = self.lock_entries()?;
            let mut order = self.lock_order()?;
            entries.insert(
                id.clone(),
                Entry {
                    job: job.clone(),
                    started: Instant::now(),
                    cancel: Arc::clone(&cancel),
                },
            );
            order.push(id.clone());
            trim(&mut entries, &mut order);
        }

        app.emit(JOB_EVENT, &job).ok();
        Ok(JobHandle {
            id,
            app: app.clone(),
            cancel,
            done_weight: 0.0,
        })
    }

    pub fn get(&self, id: &str) -> AppResult<Option<Job>> {
        Ok(self.lock_entries()?.get(id).map(snapshot))
    }

    /// Everything this session, newest first, so the frontend can rebuild its
    /// list after a reload without holding state of its own.
    pub fn list(&self) -> AppResult<Vec<Job>> {
        let entries = self.lock_entries()?;
        let order = self.lock_order()?;
        Ok(order
            .iter()
            .rev()
            .filter_map(|id| entries.get(id).map(snapshot))
            .collect())
    }

    /// Ask a job to stop. The worker checks between phases and mid-stream, so
    /// this takes effect at the next checkpoint rather than instantly.
    pub fn cancel(&self, id: &str) -> AppResult<()> {
        let entries = self.lock_entries()?;
        match entries.get(id) {
            Some(entry) => {
                entry.cancel.store(true, Ordering::SeqCst);
                Ok(())
            }
            None => Err(AppError::InvalidInput(format!("No such job: {id}"))),
        }
    }

    /// Drop finished jobs. Running ones are left alone.
    pub fn clear_finished(&self) -> AppResult<()> {
        let mut entries = self.lock_entries()?;
        let mut order = self.lock_order()?;
        entries.retain(|_, e| e.job.status == JobStatus::Running);
        order.retain(|id| entries.contains_key(id));
        Ok(())
    }

    /// Report progress for a job by id, without holding its handle.
    ///
    /// The handle cannot be shared with the ticker thread: the worker keeps it
    /// so it can bank phase weights and finish the job. The ticker only needs to
    /// move the bar inside a phase whose banked weight it was told once, which
    /// this does with no borrow of the worker's state.
    pub fn report(&self, app: &AppHandle, id: &str, phase: Phase, banked: f32, within: f32) {
        let fraction = (banked + phase.weight * within.clamp(0.0, 1.0)).clamp(0.0, 0.99);
        if let Some(job) = self.update(id, |e| {
            /* A cancelled or finished job must not be dragged back to running by
            a tick that was already in flight when it ended. */
            if e.job.status != JobStatus::Running {
                return;
            }
            let elapsed = e.started.elapsed().as_secs_f32();
            e.job.phase = phase.label.to_string();
            e.job.percent = (fraction * 100.0).round() as u8;
            e.job.eta_seconds = if fraction > 0.08 && elapsed > 2.0 {
                Some(((elapsed / fraction) - elapsed).max(0.0).round() as u64)
            } else {
                None
            };
        }) {
            if job.status == JobStatus::Running {
                app.emit(JOB_EVENT, &job).ok();
            }
        }
    }

    fn update<F: FnOnce(&mut Entry)>(&self, id: &str, f: F) -> Option<Job> {
        let mut entries = self.lock_entries().ok()?;
        let entry = entries.get_mut(id)?;
        f(entry);
        Some(snapshot(entry))
    }

    fn lock_entries(&self) -> AppResult<std::sync::MutexGuard<'_, HashMap<String, Entry>>> {
        self.entries
            .lock()
            .map_err(|_| AppError::Internal("Job registry lock poisoned".into()))
    }

    fn lock_order(&self) -> AppResult<std::sync::MutexGuard<'_, Vec<String>>> {
        self.order
            .lock()
            .map_err(|_| AppError::Internal("Job order lock poisoned".into()))
    }
}

/// Read a job with its live elapsed time filled in.
fn snapshot(entry: &Entry) -> Job {
    let mut job = entry.job.clone();
    job.elapsed_ms = entry.started.elapsed().as_millis() as u64;
    job
}

/// Keep the newest `HISTORY_LIMIT` finished jobs, and every running one.
fn trim(entries: &mut HashMap<String, Entry>, order: &mut Vec<String>) {
    let finished: Vec<String> = order
        .iter()
        .filter(|id| {
            entries
                .get(*id)
                .is_some_and(|e| e.job.status != JobStatus::Running)
        })
        .cloned()
        .collect();
    if finished.len() <= HISTORY_LIMIT {
        return;
    }
    for id in finished.iter().take(finished.len() - HISTORY_LIMIT) {
        entries.remove(id);
    }
    order.retain(|id| entries.contains_key(id));
}

/// The worker's side of a job. Report phases through it; it does the weighting,
/// the estimate, and the event.
pub struct JobHandle {
    pub id: String,
    app: AppHandle,
    cancel: Arc<AtomicBool>,
    /// Fraction of total work completed by phases already finished.
    done_weight: f32,
}

impl JobHandle {
    /// True once the user has asked to stop. Check it between phases and while
    /// streaming, and return early when it flips.
    pub fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// Fraction of the job already banked by completed phases. The ticker thread
    /// needs this to place its progress inside the current phase, and cannot
    /// borrow the handle itself.
    pub fn done_weight(&self) -> f32 {
        self.done_weight
    }

    /// Enter a phase. Progress from here advances within that phase's share.
    pub fn begin(&mut self, registry: &JobRegistry, phase: Phase) {
        self.emit(registry, phase, 0.0);
    }

    /// Report progress inside the current phase, 0.0 to 1.0. Used by the
    /// streaming path, where tokens received against the ceiling is a real
    /// measure rather than a guess.
    pub fn progress(&self, registry: &JobRegistry, phase: Phase, within: f32) {
        self.emit(registry, phase, within.clamp(0.0, 1.0));
    }

    /// Finish a phase and bank its weight.
    pub fn finish_phase(&mut self, registry: &JobRegistry, phase: Phase) {
        self.done_weight = (self.done_weight + phase.weight).min(1.0);
        self.emit(registry, phase, 1.0);
    }

    pub fn succeed(self, registry: &JobRegistry, result: String) {
        if let Some(job) = registry.update(&self.id, |e| {
            e.job.status = JobStatus::Done;
            e.job.phase = "Done".into();
            e.job.percent = 100;
            e.job.eta_seconds = Some(0);
            e.job.result = Some(result);
        }) {
            self.app.emit(JOB_EVENT, &job).ok();
        }
    }

    pub fn fail(self, registry: &JobRegistry, message: String) {
        if let Some(job) = registry.update(&self.id, |e| {
            e.job.status = JobStatus::Failed;
            e.job.phase = "Failed".into();
            e.job.eta_seconds = None;
            e.job.error = Some(message);
        }) {
            self.app.emit(JOB_EVENT, &job).ok();
        }
    }

    pub fn cancel(self, registry: &JobRegistry) {
        if let Some(job) = registry.update(&self.id, |e| {
            e.job.status = JobStatus::Cancelled;
            e.job.phase = "Cancelled".into();
            e.job.eta_seconds = None;
        }) {
            self.app.emit(JOB_EVENT, &job).ok();
        }
    }

    fn emit(&self, registry: &JobRegistry, phase: Phase, within: f32) {
        let fraction = (self.done_weight + phase.weight * within).clamp(0.0, 0.99);
        if let Some(job) = registry.update(&self.id, |e| {
            let elapsed = e.started.elapsed().as_secs_f32();
            e.job.phase = phase.label.to_string();
            e.job.percent = (fraction * 100.0).round() as u8;
            /* Only estimate once there is enough signal. Extrapolating from the
            first fraction of a percent produces numbers that swing wildly and
            teach the user to ignore the field. */
            e.job.eta_seconds = if fraction > 0.08 && elapsed > 2.0 {
                let total = elapsed / fraction;
                Some((total - elapsed).max(0.0).round() as u64)
            } else {
                None
            };
        }) {
            self.app.emit(JOB_EVENT, &job).ok();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phase_weights_sum_to_one() {
        let total = PHASE_SOURCES.weight
            + PHASE_PROMPT.weight
            + PHASE_GENERATE.weight
            + PHASE_FINALIZE.weight;
        assert!(
            (total - 1.0).abs() < 0.001,
            "phase weights must total 1.0, got {total}"
        );
    }

    #[test]
    fn generating_dominates_the_bar() {
        /* The model call is the part that takes minutes. If it were not the
        largest share the bar would race to nearly full and then stall,
        which is the failure this design exists to avoid. */
        assert!(PHASE_GENERATE.weight > 0.5);
    }

    #[test]
    fn history_is_bounded() {
        let mut entries: HashMap<String, Entry> = HashMap::new();
        let mut order: Vec<String> = Vec::new();
        for i in 0..(HISTORY_LIMIT + 10) {
            let id = format!("j{i}");
            entries.insert(
                id.clone(),
                Entry {
                    job: Job {
                        id: id.clone(),
                        kind: "test".into(),
                        notebook_id: "n".into(),
                        label: "t".into(),
                        status: JobStatus::Done,
                        phase: "Done".into(),
                        percent: 100,
                        eta_seconds: Some(0),
                        result: None,
                        error: None,
                        elapsed_ms: 0,
                    },
                    started: Instant::now(),
                    cancel: Arc::new(AtomicBool::new(false)),
                },
            );
            order.push(id);
        }
        trim(&mut entries, &mut order);
        assert_eq!(entries.len(), HISTORY_LIMIT);
        assert_eq!(order.len(), HISTORY_LIMIT);
        /* The oldest go first, so what remains is the tail. */
        assert!(entries.contains_key(&format!("j{}", HISTORY_LIMIT + 9)));
        assert!(!entries.contains_key("j0"));
    }

    #[test]
    fn running_jobs_survive_clear() {
        let registry = JobRegistry::new();
        {
            let mut entries = registry.lock_entries().unwrap();
            let mut order = registry.lock_order().unwrap();
            for (id, status) in [("a", JobStatus::Running), ("b", JobStatus::Done)] {
                entries.insert(
                    id.to_string(),
                    Entry {
                        job: Job {
                            id: id.into(),
                            kind: "test".into(),
                            notebook_id: "n".into(),
                            label: "t".into(),
                            status,
                            phase: "p".into(),
                            percent: 0,
                            eta_seconds: None,
                            result: None,
                            error: None,
                            elapsed_ms: 0,
                        },
                        started: Instant::now(),
                        cancel: Arc::new(AtomicBool::new(false)),
                    },
                );
                order.push(id.to_string());
            }
        }
        registry.clear_finished().unwrap();
        assert!(registry.get("a").unwrap().is_some());
        assert!(registry.get("b").unwrap().is_none());
    }
}
