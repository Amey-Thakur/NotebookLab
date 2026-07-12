/*
 * Name: notebook-detail-page.tsx
 * Purpose: Notebook detail page.
 * Description: Shows documents and notes within a notebook, with actions to
 *   import documents, create notes, and navigate to the editor.
 *   Sets the active notebook in the store on mount so search and
 *   chat know which notebook context to use. Documents can be
 *   imported via file dialog.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import { useNotebookStore } from "@/stores/notebook-store";
import { formatBytes } from "@/lib/utils";
import type { Notebook, Note } from "@/types/models";
import { pickDocumentFile } from "@/features/documents/api/document-api";
import { useDocuments, useImportDocument } from "@/features/documents/hooks/use-documents";
import { useDropImport } from "@/features/documents/hooks/use-drop-import";


export function NotebookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActiveNotebook = useNotebookStore((s) => s.setActiveNotebook);
  const [confirmingNoteDelete, setConfirmingNoteDelete] = useState<string | null>(null);

  useEffect(() => {
    if (id) setActiveNotebook(id);
  }, [id, setActiveNotebook]);

  const { data: notebook } = useQuery({
    queryKey: [QUERY_KEYS.NOTEBOOKS, id],
    queryFn: () => tauriInvoke<Notebook>("get_notebook", { id }),
    enabled: !!id,
  });

  const { data: documents } = useDocuments(id);

  const { data: notes } = useQuery({
    queryKey: [QUERY_KEYS.NOTES, id],
    queryFn: () => tauriInvoke<Note[]>("list_notes", { notebook_id: id }),
    enabled: !!id,
  });

  const createNote = useMutation({
    mutationFn: () =>
      tauriInvoke<Note>("create_note", { input: { notebook_id: id } }),
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTES, id] });
      navigate(`/editor/${note.id}`);
    },
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: string) => tauriInvoke<void>("delete_note", { id: noteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTES, id] });
    },
  });

  const renameNotebook = useMutation({
    mutationFn: (name: string) =>
      tauriInvoke<Notebook>("update_notebook", { id, input: { name } }),
    onSuccess: (fresh) => {
      queryClient.setQueryData([QUERY_KEYS.NOTEBOOKS, id], fresh);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTEBOOKS] });
    },
  });

  const saveNotebookName = (value: string) => {
    const name = value.trim();
    if (name && name !== notebook?.name) {
      renameNotebook.mutate(name);
    }
  };

  const importDoc = useImportDocument(id);
  const { isDragging } = useDropImport(id);

  const handleImport = async () => {
    const filePath = await pickDocumentFile();
    if (filePath) importDoc.mutate(filePath);
  };

  if (!id) return null;

  return (
    <div className="relative p-8 max-w-4xl mx-auto">
      {isDragging && (
        <div className="absolute inset-4 z-10 flex items-center justify-center border-2 border-dashed
                        border-accent bg-surface/90 pointer-events-none">
          <p className="text-sm font-mono text-accent">Drop PDF, TXT, or Markdown files to import</p>
        </div>
      )}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button
            type="button"
            onClick={() => navigate("/notebooks")}
            className="text-xs font-mono text-text-4 hover:text-text-2 mb-2 block"
          >
            &larr; All Notebooks
          </button>
          {/* The heading is editable in place; blur or Enter saves the name */}
          <input
            key={notebook?.name}
            type="text"
            defaultValue={notebook?.name ?? ""}
            aria-label="Notebook name, edit and press Enter to rename"
            onBlur={(e) => saveNotebookName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-full text-2xl font-display font-bold text-text-1 bg-transparent
                       border-none outline-none focus-visible:underline placeholder:text-text-4"
            placeholder="Notebook"
          />
          {renameNotebook.isError && (
            <p role="alert" className="text-xs text-error mt-1">{formatError(renameNotebook.error)}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => createNote.mutate()}
            className="px-3 py-1.5 text-xs font-mono bg-accent-dim text-text-1"
          >
            + New Note
          </button>
        </div>
      </div>

      {/* Notes list, shown first since notes are the primary content */}
      <div className="mb-8">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3">
          Notes ({notes?.length || 0})
        </h2>
        {createNote.isError && (
          <p role="alert" className="text-xs text-error mb-2">{formatError(createNote.error)}</p>
        )}
        {deleteNote.isError && (
          <p role="alert" className="text-xs text-error mb-2">{formatError(deleteNote.error)}</p>
        )}
        {notes?.length === 0 && (
          <p className="text-sm text-text-4">No notes yet. Create one to start writing.</p>
        )}
        {notes?.map((note) => (
          <div key={note.id} className="group flex items-center gap-2 mb-1">
            <div
              role="button"
              tabIndex={0}
              aria-label={`Open note ${note.title}`}
              className="flex-1 p-3 border border-border cursor-pointer outline-none
                         hover:border-accent-dim focus-visible:border-accent transition-colors"
              onClick={() => navigate(`/editor/${note.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/editor/${note.id}`);
                }
              }}
            >
              <span className="text-sm text-text-1 font-medium">{note.title}</span>
              <span className="text-xs font-mono text-text-4 ml-2">
                {new Date(note.updated_at).toLocaleDateString()}
              </span>
            </div>
            {confirmingNoteDelete === note.id ? (
              <span className="flex items-center gap-2 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    deleteNote.mutate(note.id);
                    setConfirmingNoteDelete(null);
                  }}
                  className="font-mono text-error hover:underline"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingNoteDelete(null)}
                  className="font-mono text-text-4 hover:text-text-2"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingNoteDelete(note.id)}
                aria-label={`Delete note ${note.title}`}
                className="shrink-0 px-2 text-xs font-mono text-text-4 opacity-0
                           group-hover:opacity-100 focus-visible:opacity-100
                           hover:text-error transition-opacity"
              >
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Documents section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono tracking-widest uppercase text-text-4">
            Documents ({documents?.length || 0})
          </h2>
          <button
            type="button"
            onClick={handleImport}
            disabled={importDoc.isPending}
            className="px-3 py-1.5 text-xs font-mono bg-accent-dim text-text-1 disabled:opacity-50"
          >
            {importDoc.isPending ? "Importing..." : "+ Import Document"}
          </button>
        </div>
        {importDoc.isError && (
          <p role="alert" className="text-xs text-error mb-2">{formatError(importDoc.error)}</p>
        )}
        {documents?.length === 0 && (
          <p className="text-sm text-text-4">No documents imported yet. Import a PDF, TXT, or Markdown file.</p>
        )}
        {documents?.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between p-3 border border-border mb-1">
            <div>
              <span className="text-sm text-text-1 font-medium">{doc.title}</span>
              <span className="text-xs font-mono text-text-4 ml-2">.{doc.file_type}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-text-4">{formatBytes(doc.file_size)}</span>
              <span className={`text-xs font-mono ${doc.status === "processed" ? "text-mark" : doc.status === "error" ? "text-error" : "text-text-4"}`}>
                {doc.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
