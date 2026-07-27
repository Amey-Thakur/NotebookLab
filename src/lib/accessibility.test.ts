/*
 * Name: accessibility.test.ts
 * Purpose: Tests for the UI scale and high-contrast preferences.
 * Description: Pins the clamping promise the module makes, that a corrupted or
 *   out-of-range stored value can never break the layout, and the boot path
 *   that applies both preferences before first paint.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-27
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  getHighContrast,
  getUiScale,
  initAccessibility,
  setHighContrast,
  setUiScale,
} from "./accessibility";

const root = document.documentElement;

afterEach(() => {
  localStorage.clear();
  root.style.fontSize = "";
  root.removeAttribute("data-contrast");
  vi.restoreAllMocks();
});

describe("getUiScale", () => {
  it("returns the default when nothing is stored", () => {
    expect(getUiScale()).toBe(UI_SCALE_DEFAULT);
  });

  it("returns a stored value that is in range", () => {
    localStorage.setItem("notebooklab-ui-scale", "125");
    expect(getUiScale()).toBe(125);
  });

  it("clamps a stored value that is out of range", () => {
    localStorage.setItem("notebooklab-ui-scale", "10000");
    expect(getUiScale()).toBe(UI_SCALE_MAX);

    localStorage.setItem("notebooklab-ui-scale", "-40");
    expect(getUiScale()).toBe(UI_SCALE_MIN);
  });

  it("falls back to the default when the stored value is not a number", () => {
    /* The promise the module makes: a corrupted value cannot break the layout. */
    localStorage.setItem("notebooklab-ui-scale", "not-a-number");
    expect(getUiScale()).toBe(UI_SCALE_DEFAULT);
  });

  it("rounds a fractional stored value", () => {
    localStorage.setItem("notebooklab-ui-scale", "112.6");
    expect(getUiScale()).toBe(113);
  });
});

describe("setUiScale", () => {
  it("applies and persists a non-default scale", () => {
    expect(setUiScale(130)).toBe(130);
    expect(root.style.fontSize).toBe("130%");
    expect(localStorage.getItem("notebooklab-ui-scale")).toBe("130");
  });

  it("clears the override at the default scale", () => {
    setUiScale(130);
    expect(setUiScale(UI_SCALE_DEFAULT)).toBe(UI_SCALE_DEFAULT);

    /* Nothing stored and no inline size, so the stylesheet governs again. */
    expect(root.style.fontSize).toBe("");
    expect(localStorage.getItem("notebooklab-ui-scale")).toBeNull();
  });

  it("returns the clamped value rather than the requested one", () => {
    expect(setUiScale(9000)).toBe(UI_SCALE_MAX);
    expect(setUiScale(1)).toBe(UI_SCALE_MIN);
  });

  it("still applies the scale when storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => setUiScale(120)).not.toThrow();
    expect(root.style.fontSize).toBe("120%");
  });
});

describe("high contrast", () => {
  it("is off by default", () => {
    expect(getHighContrast()).toBe(false);
  });

  it("sets the attribute and persists when turned on", () => {
    setHighContrast(true);
    expect(root.getAttribute("data-contrast")).toBe("high");
    expect(getHighContrast()).toBe(true);
  });

  it("removes the attribute and the key when turned off", () => {
    setHighContrast(true);
    setHighContrast(false);
    expect(root.hasAttribute("data-contrast")).toBe(false);
    expect(getHighContrast()).toBe(false);
  });

  it("still flips the attribute when storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => setHighContrast(true)).not.toThrow();
    expect(root.getAttribute("data-contrast")).toBe("high");
  });
});

describe("initAccessibility", () => {
  it("applies both stored preferences at boot", () => {
    localStorage.setItem("notebooklab-ui-scale", "140");
    localStorage.setItem("notebooklab-high-contrast", "1");

    initAccessibility();

    expect(root.style.fontSize).toBe("140%");
    expect(root.getAttribute("data-contrast")).toBe("high");
  });

  it("leaves the root untouched when nothing is stored", () => {
    initAccessibility();

    expect(root.style.fontSize).toBe("");
    expect(root.hasAttribute("data-contrast")).toBe(false);
  });

  it("does not set an inline size for the default scale", () => {
    localStorage.setItem("notebooklab-ui-scale", String(UI_SCALE_DEFAULT));

    initAccessibility();

    expect(root.style.fontSize).toBe("");
  });
});
