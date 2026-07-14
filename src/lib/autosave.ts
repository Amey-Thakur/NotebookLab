/*
 * Name: autosave.ts
 * Purpose: App-wide registry of pending-edit flushers.
 * Description: Editors (the note editor, the canvas, an in-place notebook
 *   rename) autosave debounced and flush on route change, but a hard window
 *   close or reload can fire mid-debounce, before that flush runs. Each editor
 *   registers a flush callback here; the app shell fires them all and waits for
 *   them to settle before the window is allowed to close, so the last edit is
 *   saved even on quit. Callbacks capture the latest value via a ref, so a flush
 *   always persists what is currently on screen. useAutosaveFlush wires a
 *   component's flush into the registry for its lifetime.
 * Tech Stack: React 19, TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import { useEffect, useRef } from "react";

/** A function that persists a page's pending edits. It may return a promise so
 *  the caller can wait for the write to land before the app closes. */
export type AutosaveFlush = () => void | Promise<unknown>;

const flushers = new Set<AutosaveFlush>();

/** Register a flush callback. Returns an unregister function. */
export function registerAutosaveFlush(flush: AutosaveFlush): () => void {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

/** Fire every registered flush and wait for them to settle. Never rejects, so a
 *  single failing flush cannot block the app from closing. */
export async function flushAllAutosaves(): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const flush of flushers) {
    try {
      pending.push(Promise.resolve(flush()));
    } catch {
      /* A throwing flush must not stop the others. */
    }
  }
  await Promise.allSettled(pending);
}

/** Keep a component's flush registered for its lifetime. The callback is read
 *  from a ref, so it always sees the latest props/state without re-registering
 *  (and thus without a window where no flush is registered). */
export function useAutosaveFlush(flush: AutosaveFlush): void {
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => registerAutosaveFlush(() => flushRef.current()), []);
}
