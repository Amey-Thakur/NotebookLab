/*
 * Title: use-documents.ts
 * Tech Stack: React 19, TanStack Query
 * Description: React hooks for document data fetching and mutations.
 * Important Details: All queries are scoped to the active notebook via notebookId.
 *   Mutations invalidate related queries on success to keep the UI in sync.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "@/lib/constants";
import type { Document as AppDocument, Chunk } from "@/types/models";
import * as api from "../api/document-api";


export function useDocuments(notebookId: string | undefined) {
  return useQuery<AppDocument[]>({
    queryKey: [QUERY_KEYS.DOCUMENTS, notebookId],
    queryFn: () => api.listDocuments(notebookId!),
    enabled: !!notebookId,
  });
}

export function useDocumentChunks(documentId: string | undefined) {
  return useQuery<Chunk[]>({
    queryKey: [QUERY_KEYS.DOCUMENTS, "chunks", documentId],
    queryFn: () => api.getDocumentChunks(documentId!),
    enabled: !!documentId,
  });
}

export function useImportDocument(notebookId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (filePath: string) => {
      if (!notebookId) throw new Error("No notebook selected");
      return api.importDocument(notebookId, filePath);
    },
    onSuccess: () => {
      if (notebookId) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.DOCUMENTS, notebookId] });
      }
    },
  });
}

export function useDeleteDocument(notebookId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: () => {
      if (notebookId) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.DOCUMENTS, notebookId] });
      }
    },
  });
}
