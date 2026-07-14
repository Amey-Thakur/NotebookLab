/*
 * Name: user-store.ts
 * Purpose: The name the app greets you by.
 * Description: A small client-side store for the user's display name, persisted
 *   to localStorage beside the other notebooklab-* keys so it survives reloads
 *   and stays fully offline. Set once in the first-run welcome and editable any
 *   time from Settings; the home greeting reads it. Empty means "no name yet",
 *   and the greeting falls back to just the time of day.
 * Tech Stack: Zustand, localStorage
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import { create } from "zustand";

const STORAGE_KEY = "notebooklab-display-name";
export const MAX_NAME_LENGTH = 40;

interface UserStore {
  displayName: string;
  setDisplayName: (name: string) => void;
}

export const useUserStore = create<UserStore>((set) => ({
  displayName: localStorage.getItem(STORAGE_KEY) ?? "",

  setDisplayName: (name) => {
    const value = name.slice(0, MAX_NAME_LENGTH);
    localStorage.setItem(STORAGE_KEY, value);
    set({ displayName: value });
  },
}));
