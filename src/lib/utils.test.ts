/*
 * Name: utils.test.ts
 * Purpose: Tests for shared utility functions.
 * Description: Tests for shared utility functions.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { describe, it, expect, vi } from "vitest";
import { cn, formatBytes, debounce } from "./utils";


describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const isHidden = false;
    expect(cn("base", isHidden && "hidden", "visible")).toBe("base visible");
  });

  it("resolves Tailwind conflicts", () => {
    const result = cn("px-4", "px-8");
    expect(result).toBe("px-8");
  });

  it("handles empty inputs", () => {
    expect(cn()).toBe("");
  });
});


describe("formatBytes", () => {
  it("formats zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });

  it("handles decimal precision", () => {
    expect(formatBytes(1536, 1)).toBe("1.5 KB");
  });

  it("handles negative values", () => {
    const result = formatBytes(-1024);
    expect(result).toBe("-1 KB");
  });
});


describe("debounce", () => {
  it("delays execution", async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 60));
    expect(fn).toHaveBeenCalledOnce();
  });

  it("only fires once for rapid calls", async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    debounced();
    debounced();

    await new Promise((r) => setTimeout(r, 60));
    expect(fn).toHaveBeenCalledOnce();
  });

  it("can be cancelled", async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced();
    debounced.cancel();

    await new Promise((r) => setTimeout(r, 60));
    expect(fn).not.toHaveBeenCalled();
  });

  it("passes arguments to the function", async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced("hello", 42);

    await new Promise((r) => setTimeout(r, 60));
    expect(fn).toHaveBeenCalledWith("hello", 42);
  });
});
