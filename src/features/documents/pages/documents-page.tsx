/*
 * Name: documents-page.tsx
 * Purpose: Document management page.
 * Description: Import files, view document list, preview extracted chunks,
 *   and delete documents. Scoped to the active notebook from the
 *   Zustand store. If no notebook is selected, prompts the user to
 *   select one first. Uses a split layout: document list on left,
 *   chunk preview on right.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState } from "react";
import { Link } from "react-router-dom";

import { ROUTES } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import { useNotebookStore } from "@/stores/notebook-store";
import { useDocuments, useDeleteDocument } from "../hooks/use-documents";
import { ImportButton } from "../components/import-button";
import { DocumentList } from "../components/document-list";
import { DocumentDetail } from "../components/document-detail";


export function DocumentsPage() {
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const { data: documents, isLoading, isError, error } = useDocuments(activeNotebookId ?? undefined);
  const deleteDoc = useDeleteDocument(activeNotebookId ?? undefined);

  const handleDelete = (id: string) => {
    deleteDoc.mutate(id, {
      onSuccess: () => {
        if (selectedDocId === id) setSelectedDocId(null);
      },
    });
  };

  if (!activeNotebookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-3 p-8">
        <p className="text-lg font-display font-bold mb-2">Documents</p>
        <p className="text-sm text-text-4 mb-4">
          Select a notebook first to view its documents.
        </p>
        <Link
          to={ROUTES.NOTEBOOKS}
          className="px-4 py-2 text-sm font-mono border border-border text-text-2 hover:border-accent-dim transition-colors"
        >
          Go to Notebooks
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-text-1">Documents</h1>
        <ImportButton notebookId={activeNotebookId} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document list */}
        <div>
          <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3 pb-2 border-b border-border">
            Imported ({documents?.length ?? 0})
          </h2>
          {isLoading && (
            <p className="text-xs text-text-4 font-mono py-4">Loading documents...</p>
          )}
          {isError && (
            <p role="alert" className="text-xs text-error py-4">
              Could not load documents. {formatError(error)}
            </p>
          )}
          {deleteDoc.isError && (
            <p role="alert" className="text-xs text-error py-2">
              Delete failed. {formatError(deleteDoc.error)}
            </p>
          )}
          {!isLoading && !isError && (
            <DocumentList
              documents={documents ?? []}
              selectedId={selectedDocId}
              onSelect={setSelectedDocId}
              onDelete={handleDelete}
              isDeleting={deleteDoc.isPending}
            />
          )}
        </div>

        {/* Chunk preview */}
        <div>
          <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3 pb-2 border-b border-border">
            Preview
          </h2>
          {selectedDocId ? (
            <DocumentDetail documentId={selectedDocId} />
          ) : (
            <p className="text-sm text-text-4 py-4">
              Select a document to preview its extracted passages.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
