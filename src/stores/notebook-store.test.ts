/*
 * Name: notebook-store.test.ts
 * Purpose: Tests for the notebook Zustand store.
 * Description: Verifies state management for active notebook selection and
 *   persistence.
 * Tech Stack: Vitest, Zustand
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useNotebookStore } from "./notebook-store";


describe("notebook-store", () => {
  beforeEach(() => {
    /* Reset store state between tests */
    useNotebookStore.setState({ activeNotebookId: null });
  });

  it("starts with no active notebook", () => {
    const state = useNotebookStore.getState();
    expect(state.activeNotebookId).toBeNull();
  });

  it("sets active notebook", () => {
    const { setActiveNotebook } = useNotebookStore.getState();
    setActiveNotebook("notebook-123");

    expect(useNotebookStore.getState().activeNotebookId).toBe("notebook-123");
  });

  it("can clear active notebook", () => {
    const { setActiveNotebook } = useNotebookStore.getState();
    setActiveNotebook("notebook-123");
    setActiveNotebook(null);

    expect(useNotebookStore.getState().activeNotebookId).toBeNull();
  });

  it("overwrites previous active notebook", () => {
    const { setActiveNotebook } = useNotebookStore.getState();
    setActiveNotebook("first");
    setActiveNotebook("second");

    expect(useNotebookStore.getState().activeNotebookId).toBe("second");
  });
});
