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
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}


/**
 * Debounce a function call by the specified delay in milliseconds.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
