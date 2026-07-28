/*
 * Name: job-store.ts
 * Purpose: Hold every background generation, so work outlives the page that
 *   started it.
 * Description: Each AI feature used to await its own Tauri command inside a
 *   component. The promise belonged to that component, so navigating away threw
 *   the result on the floor: the model kept working, nobody collected the
 *   answer, and coming back showed an empty page. That is the "it forgets when
 *   I switch features" report.
 *
 *   The backend now runs those generations as tracked jobs and emits progress on
 *   one channel. This subscribes to that channel once, for the life of the app,
 *   and keeps every job here. A page reads the job it started rather than
 *   owning the work, so switching away changes nothing about whether the work
 *   finishes or where the result lands.
 *
 *   Jobs are also reconciled from the backend on startup, which is what lets a
 *   reload rejoin a generation that is still running.
 * Tech Stack: Zustand, Tauri events
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

import { create } from "zustand";

import { tauriInvoke } from "@/services/tauri-client";

/** The single channel every job reports on. Matches JOB_EVENT in Rust. */
export const JOB_EVENT = "job-progress";

export type JobStatus = "running" | "done" | "failed" | "cancelled";

export interface Job {
  id: string;
  /** Feature family: "audio", "studio", "mindmap", "socratic", "transform". */
  kind: string;
  notebook_id: string;
  /** Short human label, e.g. "Debate". */
  label: string;
  status: JobStatus;
  /** What is happening right now, in words. */
  phase: string;
  /** 0 to 100, weighted so it advances at an honest rate. */
  percent: number;
  /** Seconds remaining, or null before there is enough signal to estimate. */
  eta_seconds: number | null;
  result: string | null;
  error: string | null;
  elapsed_ms: number;
}

interface JobStore {
  jobs: Record<string, Job>;
  /** True once the initial reconcile has run, so pages can tell "no job" from
      "not looked yet" and avoid flashing an empty state over a running job. */
  ready: boolean;
  upsert: (job: Job) => void;
  hydrate: () => Promise<void>;
  cancel: (id: string) => Promise<void>;
  clearFinished: () => Promise<void>;
}

export const useJobStore = create<JobStore>((set) => ({
  jobs: {},
  ready: false,

  upsert: (job) => set((s) => ({ jobs: { ...s.jobs, [job.id]: job } })),

  /* Ask the backend what it is holding. Called once at startup: a reload drops
     this store but not the jobs, and without this a generation that is still
     running would look like it had vanished. */
  hydrate: async () => {
    try {
      const list = await tauriInvoke<Job[]>("list_jobs");
      set({
        jobs: Object.fromEntries(list.map((j) => [j.id, j])),
        ready: true,
      });
    } catch {
      /* Outside the desktop app there is no backend to ask. Pages then simply
         have no jobs, which is the correct empty state rather than an error. */
      set({ ready: true });
    }
  },

  cancel: async (id) => {
    await tauriInvoke("cancel_job", { job_id: id });
  },

  clearFinished: async () => {
    await tauriInvoke("clear_finished_jobs");
    set((s) => ({
      jobs: Object.fromEntries(
        Object.entries(s.jobs).filter(([, j]) => j.status === "running"),
      ),
    }));
  },
}));

/** Every job for a notebook, newest first. */
export function selectJobs(jobs: Record<string, Job>, notebookId?: string | null): Job[] {
  return Object.values(jobs)
    .filter((j) => !notebookId || j.notebook_id === notebookId)
    .sort((a, b) => a.elapsed_ms - b.elapsed_ms);
}

/** How many are still running, for the indicator in the shell. */
export function countRunning(jobs: Record<string, Job>): number {
  return Object.values(jobs).filter((j) => j.status === "running").length;
}
