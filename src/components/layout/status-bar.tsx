/*
 * Name: status-bar.tsx
 * Purpose: Bottom status bar showing the active notebook, active LLM
 *   provider, and indexed chunk count.
 * Description: Green dot = provider active. Amber dot = no provider. The
 *   active notebook name gives chat and search results a visible
 *   scope. Polls every 10 seconds; text sizes come from the shared
 *   type scale so browser text-size settings are respected.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { useNotebookStore } from "@/stores/notebook-store";
import { useNotebooks } from "@/features/notebooks/hooks/use-notebooks";


export function StatusBar() {
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const { data: notebooks } = useNotebooks();

  const { data: activeProvider } = useQuery({
    queryKey: [QUERY_KEYS.ACTIVE_PROVIDER],
    queryFn: () => tauriInvoke<string | null>("get_active_provider_name"),
    refetchInterval: 10000,
  });

  const { data: chunkCount } = useQuery({
    queryKey: [QUERY_KEYS.CHUNK_COUNT],
    queryFn: () => tauriInvoke<number>("get_chunk_count"),
    refetchInterval: 10000,
  });

  const hasProvider = !!activeProvider;
  const chunks = chunkCount ?? 0;
  const activeNotebook = notebooks?.find((nb) => nb.id === activeNotebookId);

  return (
    <footer
      className="flex items-center justify-between h-6 px-4 border-t border-border bg-bg"
      role="status"
      aria-label="Application status"
    >
      <div className="flex items-center gap-4 min-w-0">
        <span className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full transition-colors ${
              hasProvider ? "bg-mark" : "bg-amber-600"
            }`}
            aria-hidden="true"
          />
          <span className={`font-mono text-2xs ${hasProvider ? "text-text-3" : "text-text-4"}`}>
            {activeProvider || "No model loaded"}
          </span>
        </span>

        {activeNotebook && (
          <Link
            to={ROUTES.NOTEBOOKS}
            className="font-mono text-2xs text-text-3 hover:text-text-1 truncate transition-colors"
            title={`Active notebook: ${activeNotebook.name}. Open Notebooks to switch.`}
          >
            in {activeNotebook.name}
          </Link>
        )}
      </div>

      <span className={`font-mono text-2xs ${chunks > 0 ? "text-text-3" : "text-text-4"}`}>
        {chunks} chunks indexed
      </span>
    </footer>
  );
}
