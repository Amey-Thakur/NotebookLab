/*
 * Name: format-duration.ts
 * Purpose: Say how long something has taken, and how long is left, the way a
 *   person would.
 * Description: Progress readouts are read at a glance while waiting, so the
 *   wording matters more than the precision. An estimate is rounded to a
 *   coarseness that matches how much it is really worth: seconds to the nearest
 *   five, anything past a minute to whole minutes. Reporting "about 47s left"
 *   from a figure that will move again in two seconds pretends to an accuracy
 *   the estimate does not have.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

/** Render an estimate of the time remaining. */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "almost done";
  if (seconds < 5) return "a few seconds left";
  if (seconds < 60) return `about ${Math.round(seconds / 5) * 5}s left`;
  const minutes = Math.round(seconds / 60);
  return minutes <= 1 ? "about a minute left" : `about ${minutes} min left`;
}

/** Render elapsed time from milliseconds. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}
