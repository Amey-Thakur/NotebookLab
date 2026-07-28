/*
 * Name: notebook-scope.tsx
 * Purpose: Say which notebook the page is working in, and what is in it.
 * Description: Every AI feature is scoped to the active notebook, but only the
 *   status bar said which one that was. On a feature page the user was asked to
 *   generate from "your documents" with no statement of whose documents, how
 *   many, or whether any were still parsing. With several notebooks open over a
 *   session that is a real question, and getting it wrong wastes a full
 *   generation on the wrong sources.
 *
 *   Naming the notebook and counting its readable documents makes the scope
 *   answerable before the work starts rather than inferable from the output.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

import { Link } from "react-router";

import { ROUTES } from "@/lib/constants";
import { useNotebooks } from "@/features/notebooks/hooks/use-notebooks";
import { useDocuments } from "@/features/documents/hooks/use-documents";
import { useNotebookStore } from "@/stores/notebook-store";

export function NotebookScope() {
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const { data: notebooks } = useNotebooks();
  const { data: documents } = useDocuments(activeNotebookId ?? undefined);

  const notebook = notebooks?.find((nb) => nb.id === activeNotebookId);
  if (!notebook) return null;

  const all = documents ?? [];
  const ready = all.filter((d) => d.status === "processed").length;
  const pending = all.length - ready;

  return (
    <p className="mb-4 text-xs text-text-3">
      Working in{" "}
      <Link
        to={`/notebooks/${notebook.id}`}
        className="font-mono text-text-2 hover:text-text-1 underline underline-offset-2 decoration-border"
      >
        {notebook.name}
      </Link>
      {" · "}
      {ready === 0 ? (
        <>
          no readable documents yet.{" "}
          <Link to={ROUTES.DOCUMENTS} className="text-accent hover:underline">
            Import one
          </Link>
        </>
      ) : (
        <>
          {ready} {ready === 1 ? "document" : "documents"}
          {/* Something still parsing is why an answer can miss content the user
              knows they imported a minute ago. Say so rather than let it look
              like the model ignored it. */}
          {pending > 0 && <span className="text-text-4"> ({pending} still processing)</span>}
        </>
      )}
    </p>
  );
}
