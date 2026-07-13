/*
 * Name: types.ts
 * Purpose: The canvas scene model.
 * Description: A canvas is a flat list of elements laid out in world
 *   coordinates, plus a camera. The whole thing serializes to JSON and is
 *   stored with the notebook, so images are embedded as data URLs and a
 *   scene is fully self-contained. Element order in the array is z-order,
 *   back to front.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

export type Tool = "select" | "pen" | "rectangle" | "ellipse" | "text";

/** Pan offset (screen pixels) and zoom (scale) mapping world to screen. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

interface BaseElement {
  id: string;
}

/** A freehand pen stroke. Points are [x, y, pressure] in world coordinates. */
export interface StrokeElement extends BaseElement {
  type: "stroke";
  points: number[][];
  color: string;
  size: number;
}

/** A rectangle or ellipse, positioned by its top-left corner and size. */
export interface ShapeElement extends BaseElement {
  type: "rectangle" | "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** "none" for an outline, or a color for a filled shape. */
  fill: string;
  strokeWidth: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

/** An embedded image. `src` is a data URL, so the scene stays self-contained. */
export interface ImageElement extends BaseElement {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
}

export type CanvasElement = StrokeElement | ShapeElement | TextElement | ImageElement;

export interface CanvasScene {
  version: 1;
  camera: Camera;
  elements: CanvasElement[];
}

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export function emptyScene(): CanvasScene {
  return { version: 1, camera: { ...DEFAULT_CAMERA }, elements: [] };
}

/** The palette offered in the toolbar. Neutral-forward, works in both themes. */
export const CANVAS_COLORS = [
  "#e11d48",
  "#f59e0b",
  "#10b981",
  "#3568c8",
  "#8b5cf6",
  "#111827",
  "#6b7280",
  "#f8fafc",
] as const;
