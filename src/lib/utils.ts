/*
 * Name: utils.ts
 * Purpose: General utility functions shared across the application.
 * Description: cn() merges Tailwind classes safely, resolving conflicts. This
 *   is the standard pattern used by shadcn/ui components.
 * Tech Stack: TypeScript, clsx, tailwind-merge
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";


/**
 * Merge Tailwind CSS class names with conflict resolution.
 * Combines clsx conditional logic with tailwind-merge deduplication.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


/**
 * Count words in a Markdown string for the editor's live statistics.
 * Markdown punctuation-only tokens (like ##, ---, *) do not count as words.
 */
export function countWords(text: string): number {
  const tokens = text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t));
  return tokens.length;
}


/**
 * Format byte count into human-readable string.
 */
/** Compact token counts for the usage display: 1234 -> "1.2k", 1234567 ->
    "1.2M"; exact below 1000. */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes < 0) return "-" + formatBytes(-bytes, decimals);
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}


/**
 * Debounce a function call. Returns a cancellable, flushable debounced function.
 * Call .flush() in useEffect cleanup so a pending call runs immediately instead
 * of being dropped (an editor unmounting must not lose the last edit), or
 * .cancel() when the pending call should be discarded.
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>) => {
    pendingArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      pendingArgs = null;
      fn(...args);
    }, delay);
  };

  debounced.cancel = () => {
    clearTimeout(timer);
    pendingArgs = null;
  };

  debounced.flush = () => {
    if (pendingArgs !== null) {
      clearTimeout(timer);
      const args = pendingArgs;
      pendingArgs = null;
      fn(...args);
    }
  };

  return debounced;
}
