/*
 * Title: notebooks-page.tsx
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * Description: Notebooks overview page. Shows all notebooks as cards with create
 *   and delete functionality.
 * Important Details: This is the default landing page after app startup. Empty state
 *   guides the user to create their first notebook. Notebook cards link to the
 *   notebook detail view where documents and notes are managed.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useNotebookStore } from "@/stores/notebook-store";
import { useNotebooks, useCreateNotebook, useDeleteNotebook } from "../hooks/use-notebooks";


export function NotebooksPage() {
  const navigate = useNavigate();
  const setActiveNotebook = useNotebookStore((s) => s.setActiveNotebook);
  const { data: notebooks, isLoading, error } = useNotebooks();
  const createMutation = useCreateNotebook();
  const deleteMutation = useDeleteNotebook();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-text-3">
        Loading notebooks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-error">
        Failed to load notebooks
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-display font-bold text-text-1">Notebooks</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm font-mono bg-accent-dim text-text-1 hover:bg-accent transition-colors"
        >
          + New Notebook
        </button>
      </div>

      {/* Create notebook inline form */}
      {showCreate && (
        <div className="mb-6 p-4 border border-border bg-surface-2">
          <input
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
              className="px-3 py-1 text-xs font-mono bg-accent-dim text-text-1"
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
        </div>
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
            className="px-4 py-2 text-sm font-mono bg-accent-dim text-text-1"
          >
            Create Notebook
          </button>
        </div>
      )}

      {/* Notebook grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {notebooks?.map((nb) => (
          <div
            key={nb.id}
            className="group border border-border bg-surface p-5 cursor-pointer
                       hover:border-accent-dim transition-colors"
            onClick={() => {
              setActiveNotebook(nb.id);
              navigate(`/notebooks/${nb.id}`);
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                style={{ backgroundColor: nb.color }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${nb.name}"?`)) {
                    deleteMutation.mutate(nb.id);
                  }
                }}
                className="opacity-0 group-hover:opacity-100 text-xs text-text-4
                           hover:text-error transition-all"
                aria-label={`Delete ${nb.name}`}
              >
                Delete
              </button>
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
