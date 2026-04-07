/*
 * Title: document-list.tsx
 * Tech Stack: React 19, Tailwind CSS
 * Description: Displays a list of documents within a notebook. Shows title, file type,
 *   size, processing status, and actions (view chunks, delete).
 * Important Details: Clicking a document selects it for chunk preview in the detail panel.
 *   Delete requires a confirmation click to prevent accidental data loss.
 */

import { useState } from "react";

import { formatBytes } from "@/lib/utils";
import type { Document } from "@/types/models";


interface DocumentListProps {
  documents: Document[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}


export function DocumentList({ documents, selectedId, onSelect, onDelete, isDeleting }: DocumentListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      onDelete(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  };

  if (documents.length === 0) {
    return (
      <p className="text-sm text-text-4 py-4">
        No documents yet. Import a file to get started.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className={`flex items-center justify-between p-3 border cursor-pointer transition-colors ${
            selectedId === doc.id
              ? "border-accent-dim bg-surface-2"
              : "border-border hover:border-accent-dim"
          }`}
          onClick={() => onSelect(doc.id)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-1 font-medium truncate">{doc.title}</span>
              <span className="text-xs font-mono text-text-4 flex-shrink-0">.{doc.file_type}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs font-mono text-text-4">{formatBytes(doc.file_size)}</span>
              <span className={`text-xs font-mono ${statusColor(doc.status)}`}>
                {doc.status}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(doc.id);
            }}
            disabled={isDeleting}
            className={`ml-3 px-2 py-1 text-xs font-mono border transition-colors flex-shrink-0 ${
              confirmDeleteId === doc.id
                ? "border-error text-error"
                : "border-border text-text-4 hover:text-text-2"
            }`}
          >
            {confirmDeleteId === doc.id ? "Confirm" : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}


function statusColor(status: Document["status"]): string {
  switch (status) {
    case "processed": return "text-mark";
    case "error": return "text-error";
    case "processing": return "text-accent";
    default: return "text-text-4";
  }
}
