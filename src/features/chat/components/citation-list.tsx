/*
 * Name: citation-list.tsx
 * Purpose: Source chips under an assistant chat message.
 * Description: Shows which document passages grounded the answer, with
 *   heading and page context. Citations load lazily per message
 *   and are cached indefinitely because they never change once
 *   written. Renders nothing when a message has no stored
 *   citations (for example, small talk).
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import type { CitationSource } from "@/types/models";


export function CitationList({ messageId }: { messageId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: citations } = useQuery({
    queryKey: [QUERY_KEYS.CITATIONS, messageId],
    queryFn: () => tauriInvoke<CitationSource[]>("get_message_citations", { message_id: messageId }),
    staleTime: Infinity,
  });

  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <p className="text-[10px] font-mono tracking-widest uppercase text-text-4 mb-2">Sources</p>
      <ul className="flex flex-wrap gap-1.5">
        {citations.map((citation) => {
          const isOpen = expanded === citation.chunk_id;
          const label = citation.page_number != null
            ? `${citation.document_title} · p.${citation.page_number}`
            : citation.document_title;

          return (
            <li key={citation.chunk_id}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : citation.chunk_id)}
                className="px-2 py-1 text-[11px] font-mono border border-border text-text-3
                           hover:border-accent-dim hover:text-text-2 focus-visible:border-accent
                           transition-colors"
                title={citation.heading_context || citation.document_title}
              >
                {label}
              </button>
              {isOpen && (
                <p className="mt-1.5 mb-1 p-2.5 text-xs text-text-3 bg-surface-2 border border-border leading-relaxed max-w-prose">
                  {citation.snippet}
                  {citation.snippet.length >= 240 ? "…" : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
