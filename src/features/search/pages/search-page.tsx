/*
 * Name: search-page.tsx
 * Purpose: Search page with unified results across document chunks and notes.
 * Description: Search is debounced (300ms). Requires an active notebook to
 *   scope the search. Results show matched content with source
 *   attribution.
 * Tech Stack: React 19, TanStack Query, Zustand, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { debounce } from "@/lib/utils";
import { useRetainedState } from "@/lib/use-persistent-draft";
import { formatError } from "@/lib/format-error";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { useNotebookStore } from "@/stores/notebook-store";
import type { UnifiedSearchResult } from "@/types/models";


export function SearchPage() {
  const navigate = useNavigate();
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  /* Retain the query so returning to Search shows the last results (the query
     itself drives a cached lookup) instead of an empty box. */
  const [query, setQuery] = useRetainedState<string>("notebooklab-state-search-query", "");
  const [debouncedQuery, setDebouncedQuery] = useRetainedState<string>(
    "notebooklab-state-search-debounced",
    "",
  );

  const debouncedSearch = useMemo(
    () => debounce((q: string) => setDebouncedQuery(q), 300),
    [setDebouncedQuery],
  );

  useEffect(() => {
    return () => debouncedSearch.cancel();
  }, [debouncedSearch]);

  const handleInput = (value: string) => {
    setQuery(value);
    debouncedSearch(value);
  };

  const canSearch = !!activeNotebookId && debouncedQuery.trim().length >= 2;

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEYS.SEARCH, activeNotebookId, debouncedQuery],
    queryFn: () =>
      tauriInvoke<UnifiedSearchResult>("search", {
        notebook_id: activeNotebookId!,
        query: debouncedQuery,
      }),
    enabled: canSearch,
  });

  if (!activeNotebookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-3 p-8">
        <p className="text-lg mb-2">No notebook selected</p>
        <p className="text-sm text-text-4 mb-4">
          Open a notebook first to search its documents and notes.
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
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-text-1 mb-6">Search</h1>

      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        placeholder="Search documents and notes..."
        aria-label="Search documents and notes"
        className="w-full px-4 py-3 text-sm bg-surface border border-border text-text-1
                   placeholder:text-text-4 outline-none focus:border-accent-dim mb-8"
        autoFocus
      />

      {isLoading && canSearch && (
        <p className="text-sm text-text-3">Searching...</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-error">
          {formatError(error)}
        </p>
      )}

      {data && (
        <>
          {data.notes.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3">
                Notes ({data.notes.length})
              </h2>
              {data.notes.map((note) => (
                <div
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open note ${note.title}`}
                  className="p-4 border border-border mb-2 cursor-pointer outline-none
                             hover:border-accent-dim focus-visible:border-accent transition-colors"
                  onClick={() => navigate(`/editor/${note.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/editor/${note.id}`);
                    }
                  }}
                >
                  <h3 className="text-sm font-semibold text-text-1">{note.title}</h3>
                  <p className="text-xs text-text-3 mt-1 line-clamp-2 font-body">
                    {note.content.slice(0, 200)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {data.chunks.length > 0 && (
            <div>
              <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3">
                Documents ({data.chunks.length})
              </h2>
              {data.chunks.map((chunk) => (
                <div key={chunk.chunk_id} className="p-4 border border-border mb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-accent">
                      {chunk.document_title}
                    </span>
                    {chunk.heading_context && (
                      <span className="text-xs font-mono text-text-3">
                        {chunk.heading_context}
                      </span>
                    )}
                    {chunk.page_number != null && (
                      <span className="text-xs font-mono text-text-4">
                        p.{chunk.page_number}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-2 font-body line-clamp-3">
                    {chunk.content.slice(0, 300)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {data.notes.length === 0 && data.chunks.length === 0 && (
            <p className="text-sm text-text-3 text-center py-12">
              No results for "{debouncedQuery}"
            </p>
          )}
        </>
      )}

      {!canSearch && debouncedQuery.length < 2 && (
        <p className="text-sm text-text-4 text-center py-12">
          Type at least 2 characters to search
        </p>
      )}
    </div>
  );
}
