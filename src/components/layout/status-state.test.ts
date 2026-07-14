/*
 * Name: status-state.test.ts
 * Purpose: Tests for the status-bar activity-state derivation.
 * Description: Covers the four states and their priority ordering, so the
 *   bottom-left indicator's colors, labels, and animation flag stay correct.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import { describe, it, expect } from "vitest";

import { deriveStatus } from "./status-state";

const base = { hasProvider: false, workCount: 0, providerName: null, downloadPercent: null };

describe("deriveStatus", () => {
  it("is idle (amber) with no provider and no work", () => {
    const s = deriveStatus(base);
    expect(s.key).toBe("idle");
    expect(s.dotClass).toContain("amber");
    expect(s.animate).toBe(false);
    expect(s.label).toBe("No model loaded");
  });

  it("is ready (green) when a provider is active and idle", () => {
    const s = deriveStatus({ ...base, hasProvider: true, providerName: "llama-server" });
    expect(s.key).toBe("ready");
    expect(s.dotClass).toBe("bg-mark");
    expect(s.animate).toBe(false);
    expect(s.label).toBe("llama-server");
  });

  it("is working (accent, animated) when work is in flight", () => {
    const s = deriveStatus({ ...base, hasProvider: true, providerName: "llama-server", workCount: 1 });
    expect(s.key).toBe("working");
    expect(s.dotClass).toBe("bg-accent");
    expect(s.animate).toBe(true);
    expect(s.label).toBe("Thinking…");
  });

  it("shows a downloading state that outranks working, with a clamped percent", () => {
    const s = deriveStatus({ ...base, workCount: 3, downloadPercent: 42.6 });
    expect(s.key).toBe("downloading");
    expect(s.animate).toBe(true);
    expect(s.label).toBe("Downloading model… 43%");

    expect(deriveStatus({ ...base, downloadPercent: 150 }).label).toBe("Downloading model… 100%");
    expect(deriveStatus({ ...base, downloadPercent: -5 }).label).toBe("Downloading model… 0%");
  });
});
