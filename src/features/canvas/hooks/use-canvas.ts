/*
 * Name: use-canvas.ts
 * Purpose: Load a notebook's canvas.
 * Description: One query that gets or creates the active notebook's canvas.
 *   The canvas is edited locally and autosaved, so it is never refetched and
 *   invalidated while open, which would clobber in-flight edits.
 * Tech Stack: React 19, TanStack Query
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { useQuery } from "@tanstack/react-query";

import { QUERY_KEYS } from "@/lib/constants";
import * as api from "../api/canvas-api";

export function useCanvas(notebookId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEYS.CANVAS, notebookId],
    queryFn: () => api.getOrCreateCanvas(notebookId!),
    enabled: !!notebookId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
