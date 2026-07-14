/*
 * Name: constants.test.ts
 * Purpose: Tests for application constants.
 * Description: Ensures routes, query keys, and supported file types are
 *   consistent and don't accidentally change.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { describe, it, expect } from "vitest";
import {
  ROUTES,
  QUERY_KEYS,
  SUPPORTED_FILE_TYPES,
  OCR_IMAGE_TYPES,
  EDITOR_AUTOSAVE_MS,
  isSupportedFileType,
} from "./constants";


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
    expect(SUPPORTED_FILE_TYPES).toContain(".docx");
    expect(SUPPORTED_FILE_TYPES).toContain(".png");
  });

  it("does not include legacy binary Word (.doc)", () => {
    expect(SUPPORTED_FILE_TYPES as readonly string[]).not.toContain(".doc");
  });

  it("all start with a dot", () => {
    for (const ext of SUPPORTED_FILE_TYPES) {
      expect(ext).toMatch(/^\./);
    }
  });

  it("every OCR image type is a supported type", () => {
    for (const ext of OCR_IMAGE_TYPES) {
      expect(SUPPORTED_FILE_TYPES as readonly string[]).toContain(ext);
    }
  });
});


describe("EDITOR_AUTOSAVE_MS", () => {
  it("is a reasonable interval", () => {
    expect(EDITOR_AUTOSAVE_MS).toBeGreaterThanOrEqual(1000);
    expect(EDITOR_AUTOSAVE_MS).toBeLessThanOrEqual(10000);
  });
});


describe("isSupportedFileType", () => {
  it("accepts documents, markdown, Word, and OCR images", () => {
    expect(isSupportedFileType("/path/report.pdf")).toBe(true);
    expect(isSupportedFileType("notes.md")).toBe(true);
    expect(isSupportedFileType("C:\\Users\\a\\memo.txt")).toBe(true);
    expect(isSupportedFileType("brief.docx")).toBe(true);
    expect(isSupportedFileType("scan.PNG")).toBe(true);
    expect(isSupportedFileType("fax.tif")).toBe(true);
  });

  it("rejects unsupported and legacy formats", () => {
    expect(isSupportedFileType("legacy.doc")).toBe(false);
    expect(isSupportedFileType("archive.zip")).toBe(false);
    expect(isSupportedFileType("noextension")).toBe(false);
  });
});
