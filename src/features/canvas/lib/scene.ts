/*
 * Name: scene.ts
 * Purpose: Canvas element state with undo/redo, plus element factories.
 * Description: A small history reducer over the committed element list: every
 *   finished gesture commits a new element array, and undo/redo walk the past
 *   and future stacks. In-progress gestures (a stroke being drawn, a shape
 *   being dragged) live in the component, not here, so history holds only
 *   whole, finished states. Pure and unit tested.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import type { CanvasElement } from "../types";

export interface HistoryState {
  past: CanvasElement[][];
  present: CanvasElement[];
  future: CanvasElement[][];
}

export type SceneAction =
  | { type: "reset"; elements: CanvasElement[] }
  | { type: "commit"; elements: CanvasElement[] }
  | { type: "undo" }
  | { type: "redo" };

/** How many undo steps to keep. */
export const HISTORY_LIMIT = 100;

export function initHistory(elements: CanvasElement[]): HistoryState {
  return { past: [], present: elements, future: [] };
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}

export function sceneReducer(state: HistoryState, action: SceneAction): HistoryState {
  switch (action.type) {
    case "reset":
      return { past: [], present: action.elements, future: [] };

    case "commit":
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: action.elements,
        future: [],
      };

    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}

/** Move an element by a world-space delta, per element type. */
export function translateElement(el: CanvasElement, dx: number, dy: number): CanvasElement {
  if (el.type === "stroke") {
    return {
      ...el,
      points: el.points.map((p) => [p[0] + dx, p[1] + dy, p[2] ?? 0.5]),
    };
  }
  return { ...el, x: el.x + dx, y: el.y + dy };
}

/** A collision-resistant id without pulling in a uuid dependency on the frontend. */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
