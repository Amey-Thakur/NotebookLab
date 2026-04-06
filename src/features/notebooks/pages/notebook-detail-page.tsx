/*
 * Title: notebook-detail-page.tsx
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * Description: Notebook detail page. Shows documents and notes within a notebook,
 *   with actions to import documents, create notes, and navigate to the editor.
 * Important Details: Sets the active notebook in the store on mount so search and
 *   chat know which notebook context to use. Documents can be imported via file dialog.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { useNotebookStore } from "@/stores/notebook-store";
import { formatBytes } from "@/lib/utils";
import type { Notebook, Document, Note } from "@/types/models";


export function NotebookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActiveNotebook = useNotebookStore((s) => s.setActiveNotebook);

  useEffect(() => {
    if (id) setActiveNotebook(id);
  }, [id, setActiveNotebook]);

  const { data: notebook } = useQuery({
    queryKey: [QUERY_KEYS.NOTEBOOKS, id],
    queryFn: () => tauriInvoke<Notebook>("get_notebook", { id }),
    enabled: !!id,
  });

  const { data: documents } = useQuery({
    queryKey: [QUERY_KEYS.DOCUMENTS, id],
    queryFn: () => tauriInvoke<Document[]>("list_documents", { notebook_id: id }),
    enabled: !!id,
  });

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

  const [importPath, setImportPath] = useState("");

  const importDoc = useMutation({
    mutationFn: (filePath: string) =>
      tauriInvoke<string>("import_document", { notebook_id: id, file_path: filePath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.DOCUMENTS, id] });
      setImportPath("");
    },
  });

  if (!id) return null;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <button
            type="button"
            onClick={() => navigate("/notebooks")}
            className="text-xs font-mono text-text-4 hover:text-text-2 mb-2 block"
          >
            &larr; All Notebooks
          </button>
          <h1 className="text-2xl font-display font-bold text-text-1">
            {notebook?.name || "Notebook"}
          </h1>
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

      {/* Document import */}
      <div className="mb-8 p-4 border border-border bg-surface-2">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3">
          Import Document
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            placeholder="File path (.txt, .md)..."
            className="flex-1 px-3 py-2 text-sm bg-surface border border-border text-text-1
                       placeholder:text-text-4 outline-none focus:border-accent-dim"
          />
          <button
            type="button"
            onClick={() => importPath && importDoc.mutate(importPath)}
            disabled={importDoc.isPending || !importPath}
            className="px-3 py-2 text-xs font-mono bg-accent-dim text-text-1 disabled:opacity-50"
          >
            Import
          </button>
        </div>
        {importDoc.isError && (
          <p className="text-xs text-error mt-2">{String(importDoc.error)}</p>
        )}
      </div>

      {/* Documents list */}
      <div className="mb-8">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3">
          Documents ({documents?.length || 0})
        </h2>
        {documents?.length === 0 && (
          <p className="text-sm text-text-4">No documents imported yet.</p>
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

      {/* Notes list */}
      <div>
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3">
          Notes ({notes?.length || 0})
        </h2>
        {notes?.length === 0 && (
          <p className="text-sm text-text-4">No notes yet. Create one to start writing.</p>
        )}
        {notes?.map((note) => (
          <div
            key={note.id}
            className="p-3 border border-border mb-1 cursor-pointer hover:border-accent-dim transition-colors"
            onClick={() => navigate(`/editor/${note.id}`)}
          >
            <span className="text-sm text-text-1 font-medium">{note.title}</span>
            <span className="text-xs font-mono text-text-4 ml-2">
              {new Date(note.updated_at).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
