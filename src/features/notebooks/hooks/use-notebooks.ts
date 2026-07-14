/*
 * Name: use-notebooks.ts
 * Purpose: React Query hooks for notebook data fetching and mutations.
 * Description: Query key uses QUERY_KEYS constant for cache isolation.
 *   Mutations automatically invalidate the notebooks list after
 *   success.
 * Tech Stack: React 19, TanStack Query
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "@/lib/constants";
import { useNotebookStore } from "@/stores/notebook-store";
import {
  listNotebooks,
  createNotebook,
  deleteNotebook,
  importNotebook,
  type CreateNotebookInput,
} from "../api/notebook-api";


export function useNotebooks() {
  return useQuery({
    queryKey: [QUERY_KEYS.NOTEBOOKS],
    queryFn: listNotebooks,
  });
}


export function useCreateNotebook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateNotebookInput) => createNotebook(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTEBOOKS] });
    },
  });
}


export function useImportNotebook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (srcPath: string) => importNotebook(srcPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTEBOOKS] });
    },
  });
}


export function useDeleteNotebook() {
  const queryClient = useQueryClient();
  const activeId = useNotebookStore((s) => s.activeNotebookId);
  const setActive = useNotebookStore((s) => s.setActiveNotebook);

  return useMutation({
    mutationFn: (id: string) => deleteNotebook(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTEBOOKS] });
      /* The delete cascades to the notebook's notes and documents, so drop both
         caches too (covers the home "jump back in" recent lists, keyed
         separately from the per-notebook lists). */
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTES] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.DOCUMENTS] });
      /* Clear active notebook if it was the one deleted */
      if (activeId === deletedId) {
        setActive(null);
      }
    },
  });
}
