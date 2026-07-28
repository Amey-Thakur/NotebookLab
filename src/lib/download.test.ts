/*
 * Name: download.test.ts
 * Purpose: Pin the file-name sanitiser and the duration wording.
 * Description: Both are small and both are the sort of thing that breaks
 *   silently: a bad character produces a download the operating system refuses
 *   without saying why, and a duration reading "about 0s left" for a minute
 *   teaches the user to ignore the estimate.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

import { describe, expect, it } from "vitest";

import { toFileName } from "./download";
import { formatElapsed, formatEta } from "./format-duration";

describe("toFileName", () => {
  it("keeps an ordinary title readable", () => {
    expect(toFileName("Study guide", "md")).toBe("Study-guide.md");
  });

  it("strips the characters Windows refuses", () => {
    const name = toFileName('a/b\\c:d*e?f"g<h>i|j', "md");
    expect(name).toBe("a-b-c-d-e-f-g-h-i-j.md");
    for (const ch of '\\/:*?"<>|') {
      expect(name.slice(0, -3)).not.toContain(ch);
    }
  });

  it("strips control characters", () => {
    /* Built from char codes rather than typed literally: a NUL in source
       does not survive every editor, and a test that silently loses the
       characters it is about would keep passing while proving nothing. */
    const nul = String.fromCharCode(0);
    const unitSep = String.fromCharCode(31);
    expect(toFileName(`a${nul}b${unitSep}c`, "json")).toBe("a-b-c.json");
  });

  it("never starts or ends with a dot or dash", () => {
    /* A leading dot hides the file; a trailing one is silently renamed. */
    expect(toFileName("...notes...", "md")).toBe("notes.md");
    expect(toFileName("  spaced  ", "md")).toBe("spaced.md");
  });

  it("falls back when a title sanitises to nothing", () => {
    expect(toFileName("///", "md")).toBe("notebooklab.md");
    expect(toFileName("", "md")).toBe("notebooklab.md");
  });

  it("caps the length so no filesystem rejects it", () => {
    const name = toFileName("x".repeat(300), "md");
    expect(name.length).toBeLessThanOrEqual(84);
  });
});

describe("formatEta", () => {
  it("does not pretend to precision it lacks", () => {
    expect(formatEta(47)).toBe("about 45s left");
    expect(formatEta(3)).toBe("a few seconds left");
  });

  it("switches to minutes past a minute", () => {
    expect(formatEta(65)).toBe("about a minute left");
    expect(formatEta(200)).toBe("about 3 min left");
  });

  it("handles a finished or nonsensical estimate", () => {
    expect(formatEta(0)).toBe("almost done");
    expect(formatEta(-5)).toBe("almost done");
    expect(formatEta(Number.NaN)).toBe("almost done");
  });
});

describe("formatElapsed", () => {
  it("reads as seconds under a minute", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(45_000)).toBe("45s");
  });

  it("pads the seconds past a minute", () => {
    expect(formatElapsed(65_000)).toBe("1m 05s");
    expect(formatElapsed(600_000)).toBe("10m 00s");
  });
});
