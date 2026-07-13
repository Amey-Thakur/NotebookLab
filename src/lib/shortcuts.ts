/*
 * Name: shortcuts.ts
 * Purpose: Single source of truth for every keyboard shortcut in the app.
 * Description: Shortcuts used to live inline in three separate handlers, so the
 *   help list drifted from what was actually wired. This registry is the one
 *   place they are described. The cheat sheet, the settings page, and global
 *   search all read from it, and the shell's key handler reuses the same
 *   platform-aware helpers, so what a user sees is always what is bound.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { ROUTES } from "@/lib/constants";

export type ShortcutGroup = "General" | "Navigation" | "Notes" | "Editing";

export interface Shortcut {
  /** Stable id, also used as the search key. */
  id: string;
  /** Display tokens rendered as separate keys, e.g. ["Ctrl", "K"]. The token
   *  "then" renders as a plain connector for sequence shortcuts like G then N. */
  keys: string[];
  /** What the shortcut does, in plain language. */
  description: string;
  group: ShortcutGroup;
}

/* macOS shows the Command symbol where other platforms show Ctrl. Detected once
   from the user agent; the actual key handling accepts either modifier. */
export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);

const MOD = IS_MAC ? "⌘" : "Ctrl";

/* The one list. Every entry here is a shortcut the app actually honors; adding a
   row means wiring it in the same change so the help never lies. */
export const SHORTCUTS: Shortcut[] = [
  { id: "command-palette", keys: [MOD, "K"], description: "Open universal search", group: "General" },
  { id: "keyboard-help", keys: ["?"], description: "Show keyboard shortcuts", group: "General" },
  { id: "close-dialog", keys: ["Esc"], description: "Close a dialog or the sidebar", group: "General" },

  { id: "go-home", keys: ["G", "then", "H"], description: "Go to Home", group: "Navigation" },
  { id: "go-notebooks", keys: ["G", "then", "N"], description: "Go to Notebooks", group: "Navigation" },
  { id: "go-documents", keys: ["G", "then", "D"], description: "Go to Documents", group: "Navigation" },
  { id: "go-search", keys: ["G", "then", "F"], description: "Go to Search", group: "Navigation" },
  { id: "go-chat", keys: ["G", "then", "C"], description: "Go to Chat", group: "Navigation" },
  { id: "go-graph", keys: ["G", "then", "G"], description: "Go to Connections", group: "Navigation" },
  { id: "go-settings", keys: ["G", "then", "S"], description: "Go to Settings", group: "Navigation" },
  { id: "go-about", keys: ["G", "then", "A"], description: "Go to About", group: "Navigation" },

  { id: "new-note", keys: [MOD, "N"], description: "New note in the active notebook", group: "Notes" },

  { id: "save-note", keys: [MOD, "S"], description: "Save the open note now (also autosaves)", group: "Editing" },
];

/* Sequence shortcuts: press the leader, then a letter. Keyed by the second key
   (lowercase) so the shell handler can look up a destination in one step. This
   map is the source of truth the Navigation entries above describe. */
export const GO_TO_LEADER = "g";

export const GO_TO: Record<string, string> = {
  h: ROUTES.HOME,
  n: ROUTES.NOTEBOOKS,
  d: ROUTES.DOCUMENTS,
  f: ROUTES.SEARCH,
  c: ROUTES.CHAT,
  g: ROUTES.GRAPH,
  s: ROUTES.SETTINGS,
  a: ROUTES.ABOUT,
};

/* True while focus is in a field where letters should type, not trigger a
   single-key shortcut. Sequence and "?" shortcuts must defer to typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export const GROUP_ORDER: ShortcutGroup[] = ["General", "Navigation", "Notes", "Editing"];
