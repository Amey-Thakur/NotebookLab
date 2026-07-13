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
import { emptyScene, type Camera, type CanvasScene } from "../types";

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
    const camera =
      parsed.camera && typeof parsed.camera.zoom === "number"
        ? parsed.camera
        : emptyScene().camera;
    return { version: 1, camera, elements: parsed.elements };
  } catch {
    return emptyScene();
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
