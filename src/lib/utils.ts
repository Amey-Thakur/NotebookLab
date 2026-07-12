/*
 * Title: utils.ts
 * Tech Stack: TypeScript, clsx, tailwind-merge
 * Description: General utility functions shared across the application.
 * Important Details: cn() merges Tailwind classes safely, resolving conflicts.
 *   This is the standard pattern used by shadcn/ui components.
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
 * Format byte count into human-readable string.
 */
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
