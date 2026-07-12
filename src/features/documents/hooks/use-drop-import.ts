/*
 * Name: use-drop-import.ts
 * Purpose: Drag a file onto the window, get it imported.
 * Description: Subscribes to Tauri's native drag and drop events, which
 *   deliver real file paths rather than browser File objects, filters to
 *   the supported document types, and feeds each dropped file through the
 *   existing import pipeline. Exposes the drag state so pages can show a
 *   drop target overlay while a file hovers over the window.
 * Tech Stack: React 19, Tauri v2 webview events, TanStack Query
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { useImportDocument } from "./use-documents";


const SUPPORTED = /\.(pdf|txt|text|md|markdown)$/i;


export function useDropImport(notebookId: string | undefined) {
  const importDoc = useImportDocument(notebookId);
  const [isDragging, setIsDragging] = useState(false);

  /* The mutation object changes identity per render; the ref keeps the
     event subscription stable for the lifetime of the notebook. */
  const importRef = useRef(importDoc);
  useEffect(() => {
    importRef.current = importDoc;
  }, [importDoc]);

  useEffect(() => {
    if (!notebookId) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter") {
          setIsDragging(true);
        } else if (event.payload.type === "leave") {
          setIsDragging(false);
        } else if (event.payload.type === "drop") {
          setIsDragging(false);
          for (const path of event.payload.paths.filter((p) => SUPPORTED.test(p))) {
            importRef.current.mutate(path);
          }
        }
      })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {
        /* The webview drag-drop API is unavailable outside the desktop app
           (for example in unit tests); dropping simply does nothing then. */
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [notebookId]);

  return { isDragging, importError: importDoc.isError ? importDoc.error : null };
}
