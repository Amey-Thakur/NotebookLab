/*
 * Title: notebook-store.ts
 * Tech Stack: Zustand, localStorage
 * Description: Client-side store for the currently active notebook.
 * Important Details: Persists to localStorage so the active notebook survives page
 *   reloads. Search, chat, and thinking partner use this to scope operations.
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
