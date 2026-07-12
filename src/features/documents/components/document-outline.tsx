/*
 * Name: document-outline.tsx
 * Purpose: A navigable tree of a document's structure.
 * Description: Builds an outline from the heading each chunk carries, so a
 *   long document becomes a scannable table of contents. Clicking an entry
 *   jumps to that passage in the preview list. Consecutive chunks under the
 *   same heading collapse into one entry, and passages with no heading are
 *   grouped so nothing is dropped. Read-only and derived entirely from data
 *   already indexed, so it always matches what search sees.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useMemo } from "react";

import type { Chunk } from "@/types/models";


interface OutlineEntry {
  heading: string;
  chunkId: string;
  page: number | null;
  count: number;
}

interface DocumentOutlineProps {
  chunks: Chunk[];
  onJump: (chunkId: string) => void;
}


export function DocumentOutline({ chunks, onJump }: DocumentOutlineProps) {
  const entries = useMemo<OutlineEntry[]>(() => {
    const result: OutlineEntry[] = [];
    for (const chunk of chunks) {
      const heading = chunk.heading_context?.trim() || "Untitled section";
      const last = result[result.length - 1];
      if (last && last.heading === heading) {
        last.count += 1;
      } else {
        result.push({
          heading,
          chunkId: chunk.id,
          page: chunk.page_number,
          count: 1,
        });
      }
    }
    return result;
  }, [chunks]);

  /* A single flat section is not an outline worth showing */
  if (entries.length < 2) return null;

  return (
    <nav aria-label="Document outline" className="mb-6">
      <h3 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-2">
        Outline ({entries.length})
      </h3>
      <ul className="border-l border-border">
        {entries.map((entry) => (
          <li key={entry.chunkId}>
            <button
              type="button"
              onClick={() => onJump(entry.chunkId)}
              className="w-full text-left flex items-baseline gap-2 pl-3 py-1.5 -ml-px border-l-2
                         border-transparent hover:border-accent hover:bg-surface-2
                         focus-visible:border-accent transition-colors"
            >
              <span className="text-sm text-text-2 truncate">{entry.heading}</span>
              {entry.page != null && (
                <span className="shrink-0 text-2xs font-mono text-text-4">p.{entry.page}</span>
              )}
              {entry.count > 1 && (
                <span className="shrink-0 text-2xs font-mono text-text-4">{entry.count}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
