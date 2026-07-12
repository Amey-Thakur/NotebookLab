/*
 * Name: notebook-store.ts
 * Purpose: Client-side store for the currently active notebook.
 * Description: Persists to localStorage so the active notebook survives page
 *   reloads. Search, chat, and thinking partner use this to scope
 *   operations.
 * Tech Stack: Zustand, localStorage
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { create } from "zustand";


const STORAGE_KEY = "notebooklab-active-notebook";


interface NotebookStore {
  activeNotebookId: string | null;
  setActiveNotebook: (id: string | null) => void;
}


export const useNotebookStore = create<NotebookStore>((set) => ({
  activeNotebookId: localStorage.getItem(STORAGE_KEY),

  setActiveNotebook: (id) => {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    set({ activeNotebookId: id });
  },
}));
