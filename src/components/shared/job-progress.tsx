/*
 * Name: job-progress.tsx
 * Purpose: Show what a running generation is doing, how far along it is, and
 *   roughly how much longer it will take.
 * Description: Every AI feature used to show the same pulsing "Generating..."
 *   with no end to it, which on a local model meant several minutes that were
 *   indistinguishable from a hang. This shows the phase in words, a percentage
 *   that advances at an honest rate, and an estimate once there is enough
 *   signal to give one.
 *
 *   The estimate is deliberately absent for the first couple of seconds. A
 *   number extrapolated from the first fraction of a percent swings wildly, and
 *   a user who sees it do that once stops believing the field.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

import { formatElapsed, formatEta } from "@/lib/format-duration";
import type { Job } from "@/stores/job-store";

interface Props {
  job: Job;
  onCancel?: () => void;
  /** Compact leaves out the label, for places that already name the feature. */
  compact?: boolean;
}

export function JobProgress({ job, onCancel, compact = false }: Props) {
  const done = job.status === "done";
  const stopped = job.status === "cancelled" || job.status === "failed";
  const percent = stopped ? job.percent : done ? 100 : job.percent;

  return (
    <div
      className="border border-border bg-surface p-4"
      /* One live region for the whole widget, so a screen reader announces
         "Generating, 40 percent" as one update rather than racing between the
         phase and the number as they change together. */
      role="status"
      aria-live="polite"
      aria-label={`${job.label}: ${job.phase}, ${percent} percent`}
    >
      <div className="flex items-baseline gap-3 mb-2">
        {!compact && (
          <span className="text-sm font-display font-bold text-text-1 truncate">{job.label}</span>
        )}
        <span className="text-sm text-text-2">{job.phase}</span>
        <span className="ml-auto text-sm font-mono tabular-nums text-text-1">{percent}%</span>
      </div>

      <div className="h-1.5 w-full bg-surface-2 overflow-hidden">
        <div
          className={`h-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${
            job.status === "failed"
              ? "bg-error"
              : job.status === "cancelled"
                ? "bg-text-4"
                : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center gap-3 mt-2 text-xs text-text-3">
        <span className="font-mono tabular-nums">{formatElapsed(job.elapsed_ms)}</span>
        {job.status === "running" && (
          <span>
            {job.eta_seconds == null ? "estimating..." : formatEta(job.eta_seconds)}
          </span>
        )}
        {job.status === "running" && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto font-mono text-text-3 hover:text-text-1 transition-colors"
          >
            Stop
          </button>
        )}
      </div>

      {job.status === "running" && (
        <p className="mt-2 text-xs text-text-4">
          This keeps running if you switch to another feature.
        </p>
      )}
    </div>
  );
}
