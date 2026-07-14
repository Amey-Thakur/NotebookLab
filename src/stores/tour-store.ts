/*
 * Name: tour-store.ts
 * Purpose: State for the guided "how it works" product tour.
 * Description: Tracks whether the coach-mark tour is open, and remembers in
 *   localStorage that it has been seen so it runs once on the first launch
 *   (right after the welcome) and never nags again. Kept in a store so the tour
 *   can be started from anywhere, including a "replay" button in Settings.
 * Tech Stack: Zustand, localStorage
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import { create } from "zustand";

const SEEN_KEY = "notebooklab-tour-seen";

interface TourStore {
  isOpen: boolean;
  /** Open the tour from the first step. */
  start: () => void;
  /** Close the tour and record that it has been seen. */
  finish: () => void;
}

export function hasSeenTour(): boolean {
  return localStorage.getItem(SEEN_KEY) === "true";
}

export const useTourStore = create<TourStore>((set) => ({
  isOpen: false,
  start: () => set({ isOpen: true }),
  finish: () => {
    localStorage.setItem(SEEN_KEY, "true");
    set({ isOpen: false });
  },
}));
