/*
 * Name: canvas-api.ts
 * Purpose: IPC wrappers and scene (de)serialization for the canvas.
 * Description: Maps to the Rust canvas commands, and safely turns the stored
 *   scene string into a scene object and back. Parsing tolerates an empty or
 *   damaged value by falling back to an empty scene, so a bad save can never
 *   break opening the canvas.
 * Tech Stack: TypeScript, Tauri IPC
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { tauriInvoke } from "@/services/tauri-client";
import { emptyScene, type Camera, type CanvasElement, type CanvasScene } from "../types";

export interface Canvas {
  id: string;
  notebook_id: string;
  scene: string;
  created_at: string;
  updated_at: string;
}

export function getOrCreateCanvas(notebookId: string): Promise<Canvas> {
  return tauriInvoke<Canvas>("get_or_create_canvas", { notebook_id: notebookId });
}

export function updateCanvas(id: string, scene: string): Promise<Canvas> {
  return tauriInvoke<Canvas>("update_canvas", { id, scene });
}

/** Parse a stored scene, tolerating an empty or malformed value. */
export function parseScene(raw: string): CanvasScene {
  if (!raw) return emptyScene();
  try {
    const parsed = JSON.parse(raw) as Partial<CanvasScene>;
    if (!parsed || !Array.isArray(parsed.elements)) return emptyScene();
    const c = parsed.camera;
    const camera =
      c && isFiniteNumber(c.x) && isFiniteNumber(c.y) && isFiniteNumber(c.zoom)
        ? c
        : emptyScene().camera;
    /* Drop anything malformed (for example from a hand-edited or foreign bundle)
    so a bad element can never crash the canvas on open. */
    const elements = parsed.elements.filter(isValidElement);
    return { version: 1, camera, elements };
  } catch {
    return emptyScene();
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A runtime shape check for one element, matching the discriminated union. */
function isValidElement(element: unknown): element is CanvasElement {
  if (!element || typeof element !== "object") return false;
  const e = element as Record<string, unknown>;
  if (typeof e.id !== "string") return false;
  switch (e.type) {
    case "stroke":
      /* Each point is an [x, y, pressure?] tuple; require finite coordinates so
      a malformed point cannot produce a NaN path and crash rendering on open. */
      return (
        Array.isArray(e.points) &&
        e.points.length > 0 &&
        e.points.every(
          (p) => Array.isArray(p) && p.length >= 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1]),
        )
      );
    case "rectangle":
    case "ellipse":
      return isFiniteNumber(e.x) && isFiniteNumber(e.y) && isFiniteNumber(e.w) && isFiniteNumber(e.h);
    case "text":
      return isFiniteNumber(e.x) && isFiniteNumber(e.y) && typeof e.text === "string";
    case "image":
      return (
        isFiniteNumber(e.x) &&
        isFiniteNumber(e.y) &&
        isFiniteNumber(e.w) &&
        isFiniteNumber(e.h) &&
        typeof e.src === "string"
      );
    default:
      return false;
  }
}

export function serializeScene(scene: CanvasScene): string {
  return JSON.stringify(scene);
}

/**
 * Build a scene string from already-serialized elements. Produces exactly what
 * serializeScene would, so the elements (which may hold large embedded images)
 * are stringified once and only the small camera is re-serialized on pan/zoom.
 */
export function composeScene(camera: Camera, elementsJson: string): string {
  return `{"version":1,"camera":${JSON.stringify(camera)},"elements":${elementsJson}}`;
}
