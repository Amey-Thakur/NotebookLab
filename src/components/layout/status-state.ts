/*
 * Name: status-state.ts
 * Purpose: Derive the status-bar activity indicator's state.
 * Description: A pure function that turns the app's live signals (a model
 *   provider being active, work in flight, a model download in progress) into
 *   the single visual state the bottom-left indicator shows: its label, dot
 *   color, text color, and whether it animates. Kept separate from the
 *   component so the state logic is unit-tested directly and the file exports
 *   no components.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

export type StatusKey = "downloading" | "working" | "ready" | "idle";

export interface StatusDescriptor {
  key: StatusKey;
  /** Human label, also announced to screen readers via the status region. */
  label: string;
  /** Tailwind background class for the dot. */
  dotClass: string;
  /** Tailwind text color for the label. */
  textClass: string;
  /** Whether the dot pulses and shows the ping ring (a real activity signal). */
  animate: boolean;
}

export interface StatusInput {
  hasProvider: boolean;
  /** Number of in-flight user actions (chat, import, generation, download). */
  workCount: number;
  providerName: string | null;
  /** 0-100 while a model download runs, or null when none is active. */
  downloadPercent: number | null;
}

/**
 * Resolve the indicator state in priority order: an active model download wins,
 * then any work in flight, then a ready provider, then the idle "no model"
 * state. Downloading and working share the accent color but differ in label;
 * ready is green, idle is amber.
 */
export function deriveStatus(input: StatusInput): StatusDescriptor {
  if (input.downloadPercent !== null) {
    const pct = Math.max(0, Math.min(100, Math.round(input.downloadPercent)));
    return {
      key: "downloading",
      label: `Downloading model… ${pct}%`,
      dotClass: "bg-accent",
      textClass: "text-accent",
      animate: true,
    };
  }

  if (input.workCount > 0) {
    return {
      key: "working",
      label: "Thinking…",
      dotClass: "bg-accent",
      textClass: "text-accent",
      animate: true,
    };
  }

  if (input.hasProvider) {
    return {
      key: "ready",
      label: input.providerName ?? "Ready",
      dotClass: "bg-mark",
      textClass: "text-text-3",
      animate: false,
    };
  }

  return {
    key: "idle",
    label: "No model loaded",
    dotClass: "bg-amber-500",
    textClass: "text-text-4",
    animate: false,
  };
}
