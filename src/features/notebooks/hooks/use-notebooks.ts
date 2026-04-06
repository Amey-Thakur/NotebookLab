/*
 * Title: use-notebooks.ts
 * Tech Stack: React 19, TanStack Query
 * Description: React Query hooks for notebook data fetching and mutations.
 * Important Details: Query key uses QUERY_KEYS constant for cache isolation.
 *   Mutations automatically invalidate the notebooks list after success.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "@/lib/constants";
import {
  listNotebooks,
  createNotebook,
  deleteNotebook,
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


export function useDeleteNotebook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteNotebook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTEBOOKS] });
    },
  });
}
