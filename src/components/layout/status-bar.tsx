/*
 * Title: status-bar.tsx
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * Description: Bottom status bar showing active LLM provider and indexed chunk count.
 * Important Details: Green dot = provider active. Amber/warning dot = no provider.
 *   Chunk count shows actual indexed count. Polls every 10 seconds.
 */

import { useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";


export function StatusBar() {
  const { data: activeProvider } = useQuery({
    queryKey: [QUERY_KEYS.ACTIVE_PROVIDER],
    queryFn: () => tauriInvoke<string | null>("get_active_provider_name"),
    refetchInterval: 10000,
  });

  const { data: chunkCount } = useQuery({
    queryKey: ["chunk-count"],
    queryFn: () => tauriInvoke<number>("get_chunk_count"),
    refetchInterval: 10000,
  });

  const hasProvider = !!activeProvider;
  const chunks = chunkCount ?? 0;

  return (
    <footer
      className="flex items-center justify-between h-6 px-4 border-t border-border bg-bg"
      role="status"
      aria-live="polite"
      aria-label="Application status"
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full transition-colors ${
            hasProvider ? "bg-mark" : "bg-amber-600"
          }`}
          aria-hidden="true"
        />
        <span className={`font-mono text-[9px] ${hasProvider ? "text-text-3" : "text-text-4"}`}>
          {activeProvider || "No model loaded"}
        </span>
      </div>

      <span className={`font-mono text-[9px] ${chunks > 0 ? "text-text-3" : "text-text-4"}`}>
        {chunks} chunks indexed
      </span>
    </footer>
  );
}
