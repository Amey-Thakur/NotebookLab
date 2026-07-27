/*
 * Name: autosave.test.ts
 * Purpose: Tests for the pending-edit flush registry.
 * Description: Pins the guarantees the app shell relies on when the window is
 *   closing: every registered flush runs, unregistering stops it, async flushes
 *   are awaited, and a flush that throws or rejects can never stop the others
 *   or block the close.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-27
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { flushAllAutosaves, registerAutosaveFlush } from "./autosave";

/* The registry is module state, so every registration made by a test has to be
 * undone or it leaks into the next one. */
const cleanups: (() => void)[] = [];

function register(flush: Parameters<typeof registerAutosaveFlush>[0]) {
  const unregister = registerAutosaveFlush(flush);
  cleanups.push(unregister);
  return unregister;
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

describe("flushAllAutosaves", () => {
  it("calls every registered flush", async () => {
    const first = vi.fn();
    const second = vi.fn();
    register(first);
    register(second);

    await flushAllAutosaves();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops calling a flush once it is unregistered", async () => {
    const flush = vi.fn();
    const unregister = register(flush);

    unregister();
    await flushAllAutosaves();

    expect(flush).not.toHaveBeenCalled();
  });

  it("waits for async flushes to settle before resolving", async () => {
    let landed = false;
    register(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      landed = true;
    });

    await flushAllAutosaves();

    /* If the write were not awaited, the app could close mid-save. */
    expect(landed).toBe(true);
  });

  it("runs the remaining flushes when one throws synchronously", async () => {
    const survivor = vi.fn();
    register(() => {
      throw new Error("editor blew up");
    });
    register(survivor);

    await expect(flushAllAutosaves()).resolves.toBeUndefined();
    expect(survivor).toHaveBeenCalledTimes(1);
  });

  it("does not reject when a flush rejects", async () => {
    const survivor = vi.fn();
    register(() => Promise.reject(new Error("write failed")));
    register(survivor);

    /* A failed save must not leave the window unclosable. */
    await expect(flushAllAutosaves()).resolves.toBeUndefined();
    expect(survivor).toHaveBeenCalledTimes(1);
  });

  it("resolves when nothing is registered", async () => {
    await expect(flushAllAutosaves()).resolves.toBeUndefined();
  });
});

describe("registerAutosaveFlush", () => {
  it("returns an unregister that is safe to call twice", async () => {
    const flush = vi.fn();
    const unregister = register(flush);

    unregister();
    expect(() => unregister()).not.toThrow();

    await flushAllAutosaves();
    expect(flush).not.toHaveBeenCalled();
  });

  it("keeps distinct callbacks separate when the same function is reused", async () => {
    const flush = vi.fn();
    register(flush);
    register(flush);

    await flushAllAutosaves();

    /* A Set deduplicates by identity, so one registration survives. Pinned so a
     * future switch to an array is a deliberate change rather than a surprise. */
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
