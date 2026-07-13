/*
 * Name: scene.test.ts
 * Purpose: Tests for the canvas history reducer and geometry helpers.
 * Description: Exercises commit/undo/redo, the history cap, element translation,
 *   coordinate transforms, zoom-about-a-point, and hit-testing. Pure logic, no
 *   DOM, so it runs fast and deterministically.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { describe, it, expect } from "vitest";

import {
  sceneReducer,
  initHistory,
  translateElement,
  canUndo,
  canRedo,
  HISTORY_LIMIT,
  type HistoryState,
} from "./scene";
import {
  screenToWorld,
  worldToScreen,
  zoomAt,
  elementBounds,
  hitTest,
  normalizeRect,
} from "./geometry";
import type { CanvasElement, CanvasScene } from "../types";

const rect = (id: string, x: number, y: number): CanvasElement => ({
  id,
  type: "rectangle",
  x,
  y,
  w: 100,
  h: 60,
  color: "#000",
  fill: "none",
  strokeWidth: 2,
});

describe("sceneReducer", () => {
  it("commit records history and clears redo", () => {
    let state: HistoryState = initHistory([]);
    state = sceneReducer(state, { type: "commit", elements: [rect("a", 0, 0)] });
    expect(state.present).toHaveLength(1);
    expect(canUndo(state)).toBe(true);
    expect(canRedo(state)).toBe(false);
  });

  it("undo and redo walk the timeline", () => {
    let state: HistoryState = initHistory([]);
    state = sceneReducer(state, { type: "commit", elements: [rect("a", 0, 0)] });
    state = sceneReducer(state, { type: "commit", elements: [rect("a", 0, 0), rect("b", 10, 10)] });
    expect(state.present).toHaveLength(2);

    state = sceneReducer(state, { type: "undo" });
    expect(state.present).toHaveLength(1);
    expect(canRedo(state)).toBe(true);

    state = sceneReducer(state, { type: "redo" });
    expect(state.present).toHaveLength(2);
  });

  it("a new commit after undo drops the redo future", () => {
    let state: HistoryState = initHistory([]);
    state = sceneReducer(state, { type: "commit", elements: [rect("a", 0, 0)] });
    state = sceneReducer(state, { type: "undo" });
    expect(canRedo(state)).toBe(true);
    state = sceneReducer(state, { type: "commit", elements: [rect("c", 5, 5)] });
    expect(canRedo(state)).toBe(false);
    expect(state.present[0].id).toBe("c");
  });

  it("undo/redo are no-ops at the ends", () => {
    const state = initHistory([rect("a", 0, 0)]);
    expect(sceneReducer(state, { type: "undo" })).toBe(state);
    expect(sceneReducer(state, { type: "redo" })).toBe(state);
  });

  it("reset clears history", () => {
    let state: HistoryState = initHistory([]);
    state = sceneReducer(state, { type: "commit", elements: [rect("a", 0, 0)] });
    state = sceneReducer(state, { type: "reset", elements: [rect("z", 1, 1)] });
    expect(canUndo(state)).toBe(false);
    expect(state.present[0].id).toBe("z");
  });

  it("caps the past at the history limit", () => {
    let state: HistoryState = initHistory([]);
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
      state = sceneReducer(state, { type: "commit", elements: [rect(`e${i}`, i, i)] });
    }
    expect(state.past.length).toBe(HISTORY_LIMIT);
  });
});

describe("translateElement", () => {
  it("moves a shape by its x/y", () => {
    const moved = translateElement(rect("a", 10, 10), 5, -3);
    expect(moved).toMatchObject({ x: 15, y: 7 });
  });

  it("moves every point of a stroke", () => {
    const stroke: CanvasElement = {
      id: "s",
      type: "stroke",
      points: [
        [0, 0, 0.5],
        [10, 10, 0.5],
      ],
      color: "#000",
      size: 4,
    };
    const moved = translateElement(stroke, 2, 3);
    expect(moved.type).toBe("stroke");
    if (moved.type === "stroke") {
      expect(moved.points[0]).toEqual([2, 3, 0.5]);
      expect(moved.points[1]).toEqual([12, 13, 0.5]);
    }
  });
});

describe("geometry", () => {
  it("screenToWorld and worldToScreen round-trip", () => {
    const camera = { x: 40, y: -20, zoom: 1.5 };
    const world = screenToWorld(200, 120, camera);
    const back = worldToScreen(world.x, world.y, camera);
    expect(back.x).toBeCloseTo(200);
    expect(back.y).toBeCloseTo(120);
  });

  it("zoomAt keeps the world point under the anchor fixed", () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const anchor = { x: 300, y: 200 };
    const worldBefore = screenToWorld(anchor.x, anchor.y, camera);
    const zoomed = zoomAt(camera, anchor.x, anchor.y, 2);
    const worldAfter = screenToWorld(anchor.x, anchor.y, zoomed);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
    expect(zoomed.zoom).toBe(2);
  });

  it("elementBounds covers a stroke", () => {
    const bounds = elementBounds({
      id: "s",
      type: "stroke",
      points: [
        [10, 10, 0.5],
        [40, 30, 0.5],
      ],
      color: "#000",
      size: 4,
    });
    expect(bounds.x).toBeLessThanOrEqual(10);
    expect(bounds.y).toBeLessThanOrEqual(10);
    expect(bounds.w).toBeGreaterThanOrEqual(30);
  });

  it("hitTest returns the topmost element", () => {
    const scene: CanvasScene = {
      version: 1,
      camera: { x: 0, y: 0, zoom: 1 },
      elements: [rect("bottom", 0, 0), rect("top", 20, 20)],
    };
    /* (30,30) is inside both; the later element wins. */
    expect(hitTest(scene, 30, 30)?.id).toBe("top");
    /* (5,5) is only inside the bottom one. */
    expect(hitTest(scene, 5, 5)?.id).toBe("bottom");
    /* Far away hits nothing. */
    expect(hitTest(scene, 999, 999)).toBeNull();
  });

  it("normalizeRect orders corners", () => {
    expect(normalizeRect(50, 40, 10, 10)).toEqual({ x: 10, y: 10, w: 40, h: 30 });
  });

  it("multi-line text is selectable below the first line", () => {
    const text: CanvasElement = {
      id: "t",
      type: "text",
      x: 10,
      y: 10,
      text: "line one\nline two\nline three",
      color: "#000",
      fontSize: 20,
    };
    const bounds = elementBounds(text);
    /* Three lines at 1.25em spacing should be far taller than one line. */
    expect(bounds.h).toBeGreaterThan(20 * 2.5);
    const scene: CanvasScene = { version: 1, camera: { x: 0, y: 0, zoom: 1 }, elements: [text] };
    /* A click on the third line still hits the element. */
    expect(hitTest(scene, 15, 10 + 20 * 2.5)?.id).toBe("t");
  });
});
