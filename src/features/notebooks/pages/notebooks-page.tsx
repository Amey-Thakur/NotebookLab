/*
 * Name: notebooks-page.tsx
 * Purpose: Notebooks overview page.
 * Description: Shows all notebooks as cards with create and delete
 *   functionality. This is the default landing page and the only
 *   route into a notebook, so cards must be fully keyboard
 *   operable (role=button, Enter and Space). Delete uses a
 *   two-step inline confirm because window.confirm() is a silent
 *   no-op in the macOS webview, and the copy warns that notes and
 *   documents are removed with the notebook. Create and delete
 *   failures render inline instead of disappearing into the
 *   console.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import { Skeleton } from "@/components/shared/skeleton";
import { useNotebookStore } from "@/stores/notebook-store";
import {
  useNotebooks,
  useCreateNotebook,
  useDeleteNotebook,
  useImportNotebook,
} from "../hooks/use-notebooks";
import { exportNotebook, pickExportPath, pickImportFile } from "../api/notebook-api";
import type { Notebook, RecentNote } from "@/types/models";


export function NotebooksPage() {
  const navigate = useNavigate();
  const setActiveNotebook = useNotebookStore((s) => s.setActiveNotebook);
  const { data: notebooks, isLoading, error } = useNotebooks();
  const createMutation = useCreateNotebook();
  const deleteMutation = useDeleteNotebook();
  const importMutation = useImportNotebook();
  const exportMutation = useMutation({
    mutationFn: ({ id, path }: { id: string; path: string }) => exportNotebook(id, path),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const { data: recentNotes } = useQuery({
    queryKey: [QUERY_KEYS.NOTES, "recent", 3],
    queryFn: () => tauriInvoke<RecentNote[]>("list_recent_notes", { limit: 3 }),
  });

  const openRecent = (note: RecentNote) => {
    setActiveNotebook(note.notebook_id);
    navigate(`/editor/${note.id}`);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;

    createMutation.mutate(
      { name: newName.trim() },
      {
        onSuccess: () => {
          setNewName("");
          setShowCreate(false);
        },
      },
    );
  };

  const openNotebook = (id: string) => {
    setActiveNotebook(id);
    navigate(`/notebooks/${id}`);
  };

  const handleImport = async () => {
    const path = await pickImportFile();
    if (path) importMutation.mutate(path);
  };

  const handleExport = async (nb: Notebook) => {
    const path = await pickExportPath(nb.name);
    if (path) exportMutation.mutate({ id: nb.id, path });
  };

  if (isLoading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Skeleton className="mb-8 h-8 w-40" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-error">
        {formatError(error)}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-display font-bold text-text-1">Notebooks</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleImport}
            disabled={importMutation.isPending}
            className="px-4 py-2 text-sm font-mono border border-border text-text-2 hover:border-accent-dim transition-colors disabled:opacity-50"
          >
            {importMutation.isPending ? "Importing..." : "Import"}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-mono bg-primary text-on-primary hover:bg-primary-hover transition-colors"
          >
            + New Notebook
          </button>
        </div>
      </div>

      {(importMutation.isError || exportMutation.isError) && (
        <p role="alert" className="mb-4 text-xs text-error">
          {formatError(importMutation.error ?? exportMutation.error)}
        </p>
      )}

      {/* Create notebook inline form */}
      {showCreate && (
        <div className="mb-6 p-4 border border-border bg-surface-2">
          <label htmlFor="new-notebook-name" className="sr-only">
            Notebook name
          </label>
          <input
            id="new-notebook-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Notebook name..."
            className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                       placeholder:text-text-4 outline-none focus:border-accent-dim mb-3"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="px-3 py-1 text-xs font-mono bg-primary text-on-primary disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewName(""); }}
              className="px-3 py-1 text-xs font-mono text-text-3 border border-border"
            >
              Cancel
            </button>
          </div>
          {createMutation.isError && (
            <p role="alert" className="mt-3 text-xs text-error">
              {formatError(createMutation.error)}
            </p>
          )}
        </div>
      )}

      {/* Pick up where you left off */}
      {recentNotes && recentNotes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3">
            Pick up where you left off
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {recentNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => openRecent(note)}
                className="text-left p-4 border border-border bg-surface hover:border-accent-dim
                           focus-visible:border-accent transition-colors"
              >
                <p className="text-sm font-medium text-text-1 truncate">{note.title}</p>
                <p className="text-2xs font-mono text-text-4 mt-1 truncate">
                  {note.notebook_name} · {new Date(note.updated_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {notebooks?.length === 0 && !showCreate && (
        <div className="flex flex-col items-center justify-center py-20 text-text-3">
          <p className="text-lg mb-2">No notebooks yet</p>
          <p className="text-sm text-text-4 mb-6">
            Create your first notebook to start organizing your research.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-mono bg-primary text-on-primary"
          >
            Create Notebook
          </button>
        </div>
      )}

      {deleteMutation.isError && (
        <p role="alert" className="mb-4 text-xs text-error">
          {formatError(deleteMutation.error)}
        </p>
      )}

      {/* Notebook grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {notebooks?.map((nb) => (
          <div
            key={nb.id}
            role="button"
            tabIndex={0}
            aria-label={`Open notebook ${nb.name}`}
            className="group border border-border bg-surface p-5 cursor-pointer
                       hover:border-accent-dim focus-visible:border-accent
                       outline-none transition-colors"
            onClick={() => openNotebook(nb.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openNotebook(nb.id);
              }
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                style={{ backgroundColor: nb.color }}
              />
              {confirmingDelete === nb.id ? (
                <span
                  className="flex items-center gap-2 text-xs"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <span className="text-text-3">Delete with all notes?</span>
                  <button
                    type="button"
                    onClick={() => {
                      deleteMutation.mutate(nb.id);
                      setConfirmingDelete(null);
                    }}
                    className="font-mono text-error hover:underline"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(null)}
                    className="font-mono text-text-4 hover:text-text-2"
                  >
                    No
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport(nb);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
                               focus-visible:opacity-100 text-xs font-mono text-text-4
                               hover:text-text-1 transition-all"
                    aria-label={`Export ${nb.name} to a file`}
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmingDelete(nb.id);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
                               focus-visible:opacity-100 text-xs text-text-4
                               hover:text-error transition-all"
                    aria-label={`Delete ${nb.name} and everything inside it`}
                  >
                    Delete
                  </button>
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-text-1 mb-1">{nb.name}</h3>
            {nb.description && (
              <p className="text-xs text-text-3 line-clamp-2">{nb.description}</p>
            )}
            <p className="text-2xs font-mono text-text-4 mt-3">
              {new Date(nb.created_at).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
