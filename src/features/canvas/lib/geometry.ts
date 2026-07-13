/*
 * Name: geometry.ts
 * Purpose: Pure geometry helpers for the canvas.
 * Description: Coordinate transforms between screen and world space, zoom about
 *   a point, element bounding boxes, and hit-testing. All pure functions with
 *   no React or DOM, so the interaction math is unit tested on its own.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import type { Camera, CanvasElement, CanvasScene } from "../types";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** A screen point (relative to the canvas origin) in world coordinates. */
export function screenToWorld(sx: number, sy: number, camera: Camera): Point {
  return { x: (sx - camera.x) / camera.zoom, y: (sy - camera.y) / camera.zoom };
}

/** A world point in screen coordinates. */
export function worldToScreen(wx: number, wy: number, camera: Camera): Point {
  return { x: wx * camera.zoom + camera.x, y: wy * camera.zoom + camera.y };
}

/** Zoom by `factor` toward a screen anchor so the world point under it holds still. */
export function zoomAt(camera: Camera, sx: number, sy: number, factor: number): Camera {
  const zoom = clamp(camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const worldX = (sx - camera.x) / camera.zoom;
  const worldY = (sy - camera.y) / camera.zoom;
  return { zoom, x: sx - worldX * zoom, y: sy - worldY * zoom };
}

export function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** Axis-aligned bounding box of an element, in world coordinates. */
export function elementBounds(el: CanvasElement): Rect {
  switch (el.type) {
    case "stroke": {
      if (el.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of el.points) {
        minX = Math.min(minX, p[0]);
        minY = Math.min(minY, p[1]);
        maxX = Math.max(maxX, p[0]);
        maxY = Math.max(maxY, p[1]);
      }
      const pad = el.size;
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    case "text": {
      /* Approximate width from character count; enough for selection. */
      const w = Math.max(el.text.length, 1) * el.fontSize * 0.6;
      return { x: el.x, y: el.y, w, h: el.fontSize * 1.4 };
    }
    default:
      return { x: el.x, y: el.y, w: el.w, h: el.h };
  }
}

/** The topmost element (last in z-order) whose bounds contain the world point. */
export function hitTest(scene: CanvasScene, wx: number, wy: number): CanvasElement | null {
  for (let i = scene.elements.length - 1; i >= 0; i -= 1) {
    const el = scene.elements[i];
    if (pointInRect(wx, wy, elementBounds(el))) return el;
  }
  return null;
}
