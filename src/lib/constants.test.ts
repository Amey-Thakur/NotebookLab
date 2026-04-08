/*
 * Title: constants.test.ts
 * Tech Stack: Vitest
 * Description: Tests for application constants. Ensures routes, query keys, and
 *   supported file types are consistent and don't accidentally change.
 */

import { describe, it, expect } from "vitest";
import { ROUTES, QUERY_KEYS, SUPPORTED_FILE_TYPES, EDITOR_AUTOSAVE_MS } from "./constants";


describe("ROUTES", () => {
  it("has all expected route paths", () => {
    expect(ROUTES.NOTEBOOKS).toBe("/notebooks");
    expect(ROUTES.NOTEBOOK_DETAIL).toBe("/notebooks/:id");
    expect(ROUTES.EDITOR).toBe("/editor/:id");
    expect(ROUTES.SEARCH).toBe("/search");
    expect(ROUTES.CHAT).toBe("/chat");
    expect(ROUTES.DOCUMENTS).toBe("/documents");
    expect(ROUTES.THINKING_PARTNER).toBe("/thinking-partner");
    expect(ROUTES.TRANSFORMS).toBe("/transforms");
    expect(ROUTES.PODCASTS).toBe("/podcasts");
    expect(ROUTES.MODELS).toBe("/models");
    expect(ROUTES.SETTINGS).toBe("/settings");
  });

  it("all routes start with /", () => {
    for (const route of Object.values(ROUTES)) {
      expect(route).toMatch(/^\//);
    }
  });
});


describe("QUERY_KEYS", () => {
  it("has unique values", () => {
    const values = Object.values(QUERY_KEYS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("has expected keys", () => {
    expect(QUERY_KEYS.NOTEBOOKS).toBeDefined();
    expect(QUERY_KEYS.DOCUMENTS).toBeDefined();
    expect(QUERY_KEYS.NOTES).toBeDefined();
    expect(QUERY_KEYS.PROVIDERS).toBeDefined();
  });
});


describe("SUPPORTED_FILE_TYPES", () => {
  it("includes expected formats", () => {
    expect(SUPPORTED_FILE_TYPES).toContain(".txt");
    expect(SUPPORTED_FILE_TYPES).toContain(".md");
    expect(SUPPORTED_FILE_TYPES).toContain(".pdf");
  });

  it("all start with a dot", () => {
    for (const ext of SUPPORTED_FILE_TYPES) {
      expect(ext).toMatch(/^\./);
    }
  });
});


describe("EDITOR_AUTOSAVE_MS", () => {
  it("is a reasonable interval", () => {
    expect(EDITOR_AUTOSAVE_MS).toBeGreaterThanOrEqual(1000);
    expect(EDITOR_AUTOSAVE_MS).toBeLessThanOrEqual(10000);
  });
});
