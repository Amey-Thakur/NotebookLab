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
import { Link } from "react-router";

import { ROUTES, EDITOR_AUTOSAVE_MS, QUERY_KEYS } from "@/lib/constants";
import { debounce } from "@/lib/utils";
import { useAutosaveFlush } from "@/lib/autosave";
import { useNotebookStore } from "@/stores/notebook-store";
import { tauriInvoke } from "@/services/tauri-client";

import { CANVAS_COLORS, type Camera, type CanvasElement, type Tool } from "../types";
import * as api from "../api/canvas-api";
import { useCanvas } from "../hooks/use-canvas";
import { canRedo, canUndo, initHistory, newId, sceneReducer } from "../lib/scene";
import { screenToWorld, zoomAt, type Point } from "../lib/geometry";
import { fileToScaledImage, srcToScaledImage, type ScaledImage } from "../lib/image";
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
  /* A file is hovering over the window, so the board shows where it will land. */
  const [dragOver, setDragOver] = useState(false);

  const mainRef = useRef<HTMLDivElement>(null);
  const lastSavedRef = useRef<string>(api.serializeScene(initialScene));
  /* The scene actually confirmed saved by the backend. lastSavedRef is advanced
     when a save is *scheduled*, so the unmount flush must compare against this
     one, or an edit made within the debounce window looks already-saved and is
     dropped when the pending save is cancelled on the way out. */
  const savedRef = useRef<string>(api.serializeScene(initialScene));
  /* Holds an uncommitted new text label (from the board) so the exit save can
     include one that was typed but never confirmed with a blur. */
  const pendingTextRef = useRef<CanvasElement | null>(null);

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
          savedRef.current = scene;
          /* Mirror the saved scene into the query cache so a quick return does
          not restore a stale copy over what was just written. */
          queryClient.setQueryData([QUERY_KEYS.CANVAS, canvas.notebook_id], updated);
        })
        .catch(() => setSaveState("error"));
    },
    [queryClient, canvas.id, canvas.notebook_id],
  );

  /* The debounced wrapper takes the persist function as a call-time argument
     rather than closing over it, so this render-phase useMemo never captures a
     ref-accessing closure (persistScene writes savedRef). It is only ever
     invoked from effects below, where reading refs is safe. */
  const saveScene = useMemo(
    () => debounce((scene: string, persist: (s: string) => void) => persist(scene), EDITOR_AUTOSAVE_MS),
    [],
  );

  /* Autosave whenever elements or camera change, skipping the seeded state. */
  useEffect(() => {
    if (sceneString === lastSavedRef.current) return;
    lastSavedRef.current = sceneString;
    saveScene(sceneString, persistScene);
  }, [sceneString, saveScene, persistScene]);

  /* A failed save clears the baseline so the next change, or the save on the way
     out, retries instead of treating the unsaved scene as already saved. */
  useEffect(() => {
    if (saveState === "error") lastSavedRef.current = "";
  }, [saveState]);

  /* Compose and save the current scene right now, awaiting the write. Cancels
     the debounce, folds in any uncommitted text label, and no-ops when the scene
     already matches what the backend last confirmed. Used on unmount and by the
     app-close flush, so an edit made inside the debounce window is never lost. */
  const flushCanvas = useCallback((): void | Promise<unknown> => {
    saveScene.cancel();
    const elements = [...presentRef.current];
    if (pendingTextRef.current) elements.push(pendingTextRef.current);
    const scene = api.composeScene(cameraRef.current, JSON.stringify(elements));
    if (scene === savedRef.current) return;
    return api
      .updateCanvas(canvas.id, scene)
      .then((updated) => {
        savedRef.current = scene;
        queryClient.setQueryData([QUERY_KEYS.CANVAS, canvas.notebook_id], updated);
      })
      .catch(() => {
        /* Swallow so a failed exit save cannot block the app from closing. */
      });
  }, [saveScene, queryClient, canvas.id, canvas.notebook_id]);

  const flushCanvasRef = useRef(flushCanvas);
  useEffect(() => {
    flushCanvasRef.current = flushCanvas;
  });

  /* Save on a hard app close too (a quit can fire mid-debounce). */
  useAutosaveFlush(flushCanvas);

  /* On the way out, cancel the pending debounce and force a final save if there
     are unsaved changes, so nothing typed or drawn in the last moment is lost. */
  useEffect(() => {
    return () => {
      void flushCanvasRef.current();
    };
  }, []);

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

  const placeImage = useCallback(async (scaled: ScaledImage, world?: Point) => {
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
  }, []);

  const addImageFile = useCallback(
    async (file: File, world?: Point) => {
      try {
        await placeImage(await fileToScaledImage(file), world);
      } catch {
        /* An unreadable image is ignored rather than breaking the canvas. */
      }
    },
    [placeImage],
  );

  /* A file dropped on the window arrives as a path, so the bytes are fetched
     from the backend rather than read from a browser File. */
  const addImagePath = useCallback(
    async (path: string, world?: Point) => {
      try {
        const src = await tauriInvoke<string>("read_image_data_url", { path });
        await placeImage(await srcToScaledImage(src), world);
      } catch {
        /* A file that is not a readable image is ignored: the drop simply does
           nothing rather than the canvas showing an error for a stray file. */
      }
    },
    [placeImage],
  );


  /* Files dropped on the window.
     
     This used to be an HTML5 onDrop on the board, which only fires while Tauri
     leaves drag-and-drop to the webview. That setting is now on, so the webview
     never sees a drop and the handler was dead; documents dropped anywhere else
     in the app were dead for the opposite reason. One mechanism now serves both.
     
     Tauri reports the cursor in physical pixels, so it is divided by the device
     pixel ratio before being compared against CSS-pixel element bounds. Missing
     that conversion places an image far from the cursor on any scaled display,
     which is most laptops. */
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/webview")
      .then(async ({ getCurrentWebview }) => {
        const stop = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "enter") {
            setDragOver(true);
            return;
          }
          if (event.payload.type === "leave") {
            setDragOver(false);
            return;
          }
          if (event.payload.type !== "drop") return;
          setDragOver(false);

          const board = mainRef.current;
          if (!board) return;
          const rect = board.getBoundingClientRect();
          const ratio = window.devicePixelRatio || 1;
          const x = event.payload.position.x / ratio - rect.left;
          const y = event.payload.position.y / ratio - rect.top;

          /* Only claim a drop that landed on the board. Anything else belongs
             to whichever page is handling document import. */
          if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

          const world = screenToWorld(x, y, cameraRef.current);
          for (const path of event.payload.paths) {
            void addImagePath(path, world);
          }
        });
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        /* No webview drag-drop API: the toolbar file picker still works. */
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [addImagePath]);

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
        {dragOver && (
          <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center
                          border-2 border-dashed border-accent-dim bg-surface/70">
            <p className="text-sm font-mono text-text-2">Drop an image to place it here</p>
          </div>
        )}
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
          pendingTextRef={pendingTextRef}
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
