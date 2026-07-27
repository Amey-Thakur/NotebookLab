/*
 * Name: shortcuts.test.ts
 * Purpose: Tests for the keyboard shortcut registry.
 * Description: The registry exists so the help never drifts from what is
 *   actually bound. These tests pin that: the Navigation entries and the GO_TO
 *   map must describe each other exactly, ids stay unique, every group is
 *   ordered, and typing targets suppress single-key shortcuts.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-27
 */

import { describe, expect, it } from "vitest";

import { ROUTES } from "./constants";
import { GO_TO, GO_TO_LEADER, GROUP_ORDER, SHORTCUTS, isTypingTarget } from "./shortcuts";

/** The letter a sequence shortcut ends on, e.g. ["G", "then", "N"] -> "n". */
function sequenceKey(keys: string[]): string | null {
  const index = keys.indexOf("then");
  if (index === -1) return null;
  return keys[index + 1]?.toLowerCase() ?? null;
}

const navigation = SHORTCUTS.filter((shortcut) => shortcut.group === "Navigation");

describe("the Navigation list and GO_TO describe each other", () => {
  it("gives every Navigation shortcut a destination", () => {
    for (const shortcut of navigation) {
      const key = sequenceKey(shortcut.keys);
      expect(key, `${shortcut.id} is not a sequence shortcut`).not.toBeNull();
      expect(GO_TO, `${shortcut.id} has no GO_TO entry`).toHaveProperty(key as string);
    }
  });

  it("gives every destination a Navigation shortcut", () => {
    const advertised = new Set(navigation.map((shortcut) => sequenceKey(shortcut.keys)));
    for (const key of Object.keys(GO_TO)) {
      /* An unadvertised destination is a shortcut users cannot discover. */
      expect(advertised, `GO_TO.${key} is not in the help list`).toContain(key);
    }
  });

  it("starts every Navigation shortcut with the leader key", () => {
    for (const shortcut of navigation) {
      expect(shortcut.keys[0]?.toLowerCase()).toBe(GO_TO_LEADER);
    }
  });

  it("points every destination at a real route", () => {
    const routes = new Set<string>(Object.values(ROUTES));
    for (const [key, route] of Object.entries(GO_TO)) {
      expect(routes, `GO_TO.${key} points at ${route}, which is not in ROUTES`).toContain(route);
    }
  });

  it("sends each destination to a distinct route", () => {
    const routes = Object.values(GO_TO);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

describe("the registry as a whole", () => {
  it("keeps shortcut ids unique", () => {
    const ids = SHORTCUTS.map((shortcut) => shortcut.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders every group it uses", () => {
    for (const shortcut of SHORTCUTS) {
      expect(GROUP_ORDER, `group ${shortcut.group} is unordered`).toContain(shortcut.group);
    }
  });

  it("describes every shortcut in plain language", () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.description.trim().length, `${shortcut.id} has no description`).toBeGreaterThan(0);
      expect(shortcut.keys.length, `${shortcut.id} has no keys`).toBeGreaterThan(0);
    }
  });
});

describe("isTypingTarget", () => {
  it.each(["input", "textarea", "select"])("suppresses shortcuts inside %s", (tag) => {
    expect(isTypingTarget(document.createElement(tag))).toBe(true);
  });

  it("suppresses shortcuts inside a contenteditable element", () => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    /* jsdom does not derive isContentEditable from the attribute. */
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTypingTarget(editable)).toBe(true);
  });

  it("allows shortcuts outside a field", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
  });

  it("allows shortcuts when there is no target", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});
