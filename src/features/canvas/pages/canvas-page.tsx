/*
 * Name: canvas-page.tsx
 * Purpose: The notebook canvas workspace.
 * Description: The page loads the active notebook's canvas, then hands it to an
 *   editor keyed by canvas id, so switching notebooks remounts with a fresh,
 *   correctly seeded state instead of copying data in through an effect. The
 *   editor owns the canvas state (elements with undo/redo, camera, tool, color,
 *   weight, selection) and autosaves debounced, flushing on the way out. The
 *   toolbar and the interactive board are its children; keyboard gives undo,
 *   redo, and delete; images can be added from the toolbar or dropped.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { ROUTES, EDITOR_AUTOSAVE_MS, QUERY_KEYS } from "@/lib/constants";
import { debounce } from "@/lib/utils";
import { useNotebookStore } from "@/stores/notebook-store";

import { CANVAS_COLORS, type Camera, type CanvasElement, type Tool } from "../types";
import * as api from "../api/canvas-api";
import { useCanvas } from "../hooks/use-canvas";
import { canRedo, canUndo, initHistory, newId, sceneReducer } from "../lib/scene";
import { screenToWorld, zoomAt, type Point } from "../lib/geometry";
import { fileToScaledImage } from "../lib/image";
import { CanvasToolbar } from "../components/canvas-toolbar";
import { CanvasBoard } from "../components/canvas-board";

type SaveState = "idle" | "saving" | "saved" | "error";

export function CanvasPage() {
  const notebookId = useNotebookStore((s) => s.activeNotebookId);
  const query = useCanvas(notebookId ?? undefined);

  if (!notebookId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-text-3">
        <p className="mb-2 text-lg">No notebook selected</p>
        <p className="mb-4 text-sm text-text-4">Open a notebook first to use its canvas.</p>
        <Link
          to={ROUTES.NOTEBOOKS}
          className="border border-border px-4 py-2 font-mono text-sm text-text-2 transition-colors hover:border-accent-dim"
        >
          Go to Notebooks
        </Link>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-error">
        The canvas could not be opened.
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-4">
        Opening canvas...
      </div>
    );
  }

  return <CanvasEditor key={query.data.id} canvas={query.data} />;
}

function CanvasEditor({ canvas }: { canvas: api.Canvas }) {
  const queryClient = useQueryClient();
  const initialScene = useMemo(() => api.parseScene(canvas.scene), [canvas.scene]);

  const [history, dispatch] = useReducer(sceneReducer, initialScene.elements, initHistory);
  const [camera, setCamera] = useState<Camera>(initialScene.camera);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState<string>(CANVAS_COLORS[3]);
  const [strokeSize, setStrokeSize] = useState<number>(6);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const mainRef = useRef<HTMLDivElement>(null);
  const lastSavedRef = useRef<string>(api.serializeScene(initialScene));

  /* Mirror the latest values so the stable callbacks below can read them. */
  const presentRef = useRef(history.present);
  const cameraRef = useRef(camera);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    presentRef.current = history.present;
    cameraRef.current = camera;
    selectedRef.current = selectedId;
  });

  /* Serialize elements once when they change, then recombine with the tiny
     camera cheaply on every pan/zoom, so panning never re-stringifies image
     data on the main thread. */
  const elementsJson = useMemo(() => JSON.stringify(history.present), [history.present]);
  const sceneString = useMemo(() => api.composeScene(camera, elementsJson), [camera, elementsJson]);

  const persistScene = useCallback(
    (scene: string) => {
      setSaveState("saving");
      api
        .updateCanvas(canvas.id, scene)
        .then((updated) => {
          setSaveState("saved");
          /* Mirror the saved scene into the query cache so a quick return does
          not restore a stale copy over what was just written. */
          queryClient.setQueryData([QUERY_KEYS.CANVAS, canvas.notebook_id], updated);
        })
        .catch(() => setSaveState("error"));
    },
    [queryClient, canvas.id, canvas.notebook_id],
  );

  const saveScene = useMemo(
    () => debounce((scene: string) => persistScene(scene), EDITOR_AUTOSAVE_MS),
    [persistScene],
  );

  /* Autosave whenever elements or camera change, skipping the seeded state. */
  useEffect(() => {
    if (sceneString === lastSavedRef.current) return;
    lastSavedRef.current = sceneString;
    saveScene(sceneString);
  }, [sceneString, saveScene]);

  /* A failed save clears the baseline so the next change, or the save on the way
     out, retries instead of treating the unsaved scene as already saved. */
  useEffect(() => {
    if (saveState === "error") lastSavedRef.current = "";
  }, [saveState]);

  /* On the way out, cancel the pending debounce and force a final save if there
     are unsaved changes, updating the cache so a quick return shows the latest. */
  useEffect(() => {
    return () => {
      saveScene.cancel();
      const scene = api.composeScene(cameraRef.current, JSON.stringify(presentRef.current));
      if (scene !== lastSavedRef.current) {
        queryClient.setQueryData([QUERY_KEYS.CANVAS, canvas.notebook_id], (old?: api.Canvas) =>
          old ? { ...old, scene } : old,
        );
        api.updateCanvas(canvas.id, scene).catch(() => {});
      }
    };
  }, [saveScene, queryClient, canvas.id, canvas.notebook_id]);

  const commit = useCallback((elements: CanvasElement[]) => {
    dispatch({ type: "commit", elements });
  }, []);
  const undo = useCallback(() => {
    dispatch({ type: "undo" });
    setSelectedId(null);
  }, []);
  const redo = useCallback(() => {
    dispatch({ type: "redo" });
    setSelectedId(null);
  }, []);
  const deleteSelected = useCallback(() => {
    const id = selectedRef.current;
    if (!id) return;
    dispatch({ type: "commit", elements: presentRef.current.filter((el) => el.id !== id) });
    setSelectedId(null);
  }, []);

  const addImageFile = useCallback(async (file: File, world?: Point) => {
    try {
      const scaled = await fileToScaledImage(file);
      const maxWidth = 480;
      const scale = scaled.width > maxWidth ? maxWidth / scaled.width : 1;
      const w = scaled.width * scale;
      const h = scaled.height * scale;

      let at = world;
      if (!at) {
        const rect = mainRef.current?.getBoundingClientRect();
        at = screenToWorld((rect?.width ?? 800) / 2, (rect?.height ?? 600) / 2, cameraRef.current);
      }

      const element: CanvasElement = {
        id: newId(),
        type: "image",
        x: at.x - w / 2,
        y: at.y - h / 2,
        w,
        h,
        src: scaled.src,
      };
      dispatch({ type: "commit", elements: [...presentRef.current, element] });
      setSelectedId(element.id);
    } catch {
      /* An unreadable image is ignored rather than breaking the canvas. */
    }
  }, []);

  /* Keyboard: undo/redo and delete, but never while typing in the text editor. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedRef.current) {
          e.preventDefault();
          deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, deleteSelected]);

  const zoomAtCenter = useCallback((factor: number) => {
    const rect = mainRef.current?.getBoundingClientRect();
    const cx = (rect?.width ?? 800) / 2;
    const cy = (rect?.height ?? 600) / 2;
    setCamera((c) => zoomAt(c, cx, cy, factor));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pb-3 pt-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-1">Canvas</h1>
          <p className="text-sm text-text-3">One open space to sketch, arrange, and think.</p>
        </div>
        <SaveIndicator state={saveState} />
      </div>

      <div ref={mainRef} className="relative flex-1 border-t border-border">
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <CanvasToolbar
            tool={tool}
            onToolChange={setTool}
            color={color}
            onColorChange={setColor}
            strokeSize={strokeSize}
            onStrokeSizeChange={setStrokeSize}
            canUndo={canUndo(history)}
            canRedo={canRedo(history)}
            onUndo={undo}
            onRedo={redo}
            hasSelection={selectedId !== null}
            onDelete={deleteSelected}
            onAddImage={(file) => addImageFile(file)}
            zoom={camera.zoom}
            onZoomIn={() => zoomAtCenter(1.2)}
            onZoomOut={() => zoomAtCenter(1 / 1.2)}
            onResetView={() => setCamera({ x: 0, y: 0, zoom: 1 })}
          />
        </div>

        <CanvasBoard
          elements={history.present}
          camera={camera}
          tool={tool}
          color={color}
          strokeSize={strokeSize}
          selectedId={selectedId}
          onCameraChange={setCamera}
          onSelect={setSelectedId}
          onCommit={commit}
          onToolChange={setTool}
          onDropImage={(file, world) => addImageFile(file, world)}
        />
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const label =
    state === "saving"
      ? "Saving..."
      : state === "saved"
        ? "Saved"
        : state === "error"
          ? "Save failed"
          : "";
  if (!label) return null;
  return (
    <span
      className={`font-mono text-xs ${state === "error" ? "text-error" : "text-text-4"}`}
      role="status"
    >
      {label}
    </span>
  );
}
