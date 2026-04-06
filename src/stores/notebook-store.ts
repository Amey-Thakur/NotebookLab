/*
 * Title: notebook-store.ts
 * Tech Stack: Zustand
 * Description: Client-side store for the currently active notebook.
 * Important Details: Persists active notebook ID so search, chat, and editor
 *   know which notebook context to operate in. This is UI state, not data.
 */

import { create } from "zustand";


interface NotebookStore {
  activeNotebookId: string | null;
  setActiveNotebook: (id: string | null) => void;
}


export const useNotebookStore = create<NotebookStore>((set) => ({
  activeNotebookId: null,
  setActiveNotebook: (id) => set({ activeNotebookId: id }),
}));
