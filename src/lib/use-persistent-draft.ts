/*
 * Name: use-persistent-draft.ts
 * Purpose: A useState whose value is mirrored to localStorage.
 * Description: The tool pages (Prompt Studio, Transforms, the Studio, Audio
 *   overview) hold text a user types before running an AI action. That input is
 *   otherwise plain component state and is lost on navigating away or reloading.
 *   This hook backs a string value with localStorage so the draft survives, and
 *   returns a clear() to drop it once it has been consumed. Reads and writes are
 *   wrapped so a disabled or full storage never throws; it simply stops
 *   persisting. Keys should be stable per surface (prefix "notebooklab-draft-").
 * Tech Stack: React 19, TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import { useCallback, useEffect, useState } from "react";

export function usePersistentDraft(
  key: string,
  initial = "",
): [string, (next: string) => void, () => void] {
  const [value, setValue] = useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      /* Storage full or unavailable: the draft simply is not persisted. */
    }
  }, [key, value]);

  const clear = useCallback(() => {
    setValue("");
    try {
      localStorage.removeItem(key);
    } catch {
      /* Ignore: there is nothing to lose if removal fails. */
    }
  }, [key]);

  return [value, setValue, clear];
}

/**
 * A useState whose value survives navigation and reload, for any JSON value.
 *
 * The sidebar features (Transform, the Studio, Audio, the thinking partner,
 * Search) hold a selection and a generated result in component state, which is
 * thrown away when the page unmounts on navigation. Backing that state with
 * localStorage means returning to a feature reopens the last selection and
 * result instead of a blank screen, so the app picks up where the user left
 * off. Keys should be stable per surface (prefix "notebooklab-state-").
 */
export function useRetainedState<T>(key: string, initial: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Storage full or unavailable: the value simply is not persisted. */
    }
  }, [key, value]);

  return [value, setValue];
}
