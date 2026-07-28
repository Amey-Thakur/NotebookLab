/*
 * Name: use-job-run.ts
 * Purpose: Start a backend generation and stay attached to it across navigation.
 * Description: The page no longer owns the work. It starts a job, remembers the
 *   id, and reads that job out of the store. Leaving the page and coming back
 *   re-attaches to the same job, because the id is retained and the job itself
 *   lives in the backend. That is what makes a generation survive a feature
 *   switch instead of disappearing with the component.
 *
 *   The remembered id also outlives a reload, so a user who restarts the window
 *   mid-generation still finds their result waiting.
 * Tech Stack: React 19, Zustand
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

import { useCallback, useState } from "react";

import { tauriInvoke } from "@/services/tauri-client";
import { formatError } from "@/lib/format-error";
import { useRetainedState } from "@/lib/use-persistent-draft";
import { useJobStore, type Job } from "@/stores/job-store";

export interface JobRun {
  /** The job this page is attached to, if any. */
  job: Job | undefined;
  /** True while the backend is working, whichever page you are looking at. */
  isRunning: boolean;
  /** The finished text, or undefined until there is one. */
  result: string | undefined;
  /** A rejected start, or a job that failed. */
  error: string | null;
  /** True once the store has asked the backend what it is holding. Until then
      a page should not claim there is nothing running. */
  ready: boolean;
  start: (args: Record<string, unknown>) => Promise<void>;
  cancel: () => void;
  /** Detach from the current job without stopping it. */
  reset: () => void;
}

/**
 * @param command  the Tauri command that starts the job and returns its id
 * @param storageKey  where to remember the id, so the page can re-attach
 */
export function useJobRun(command: string, storageKey: string): JobRun {
  const [jobId, setJobId] = useRetainedState<string | null>(storageKey, null);
  const [startError, setStartError] = useState<string | null>(null);

  const job = useJobStore((s) => (jobId ? s.jobs[jobId] : undefined));
  const ready = useJobStore((s) => s.ready);
  const cancelJob = useJobStore((s) => s.cancel);

  const start = useCallback(
    async (args: Record<string, unknown>) => {
      setStartError(null);
      try {
        /* The command returns a job id immediately; the work continues in the
           backend. Nothing here awaits the generation itself. */
        const id = await tauriInvoke<string>(command, args);
        setJobId(id);
      } catch (e) {
        /* A rejected start is a validation error the user can fix, such as an
           empty topic. It never became a job, so it is held here. */
        setStartError(formatError(e));
      }
    },
    [command, setJobId],
  );

  const cancel = useCallback(() => {
    if (jobId) void cancelJob(jobId).catch(() => {});
  }, [jobId, cancelJob]);

  const reset = useCallback(() => {
    setJobId(null);
    setStartError(null);
  }, [setJobId]);

  return {
    job,
    isRunning: job?.status === "running",
    result: job?.status === "done" ? (job.result ?? undefined) : undefined,
    error: startError ?? (job?.status === "failed" ? job.error : null),
    ready,
    start,
    cancel,
    reset,
  };
}
