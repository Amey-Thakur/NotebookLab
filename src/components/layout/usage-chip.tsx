/*
 * Name: usage-chip.tsx
 * Purpose: Live token usage in the status bar, with a per-model breakdown.
 * Description: A quiet chip showing the session's real token total, exactly
 *   as reported by providers, never estimated. Clicking opens a small panel:
 *   the last request's context use (with a fill bar and percentage only when
 *   the model's window is a known fact), and each model's session share with
 *   requests and token counts. The chip stays hidden until the first AI
 *   request of the session so an idle app carries no extra chrome. Polls a
 *   few times a minute; the read is served from memory in microseconds.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { cn, formatTokens } from "@/lib/utils";
import type { UsageStats } from "@/types/models";

export function UsageChip() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: stats } = useQuery({
    queryKey: [QUERY_KEYS.USAGE],
    queryFn: () => tauriInvoke<UsageStats>("get_usage_stats"),
    refetchInterval: 5000,
  });

  /* Close on outside click and Escape while open. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const models = stats?.models ?? [];
  const totalTokens = models.reduce((sum, m) => sum + m.prompt_tokens + m.completion_tokens, 0);
  const totalRequests = models.reduce((sum, m) => sum + m.requests, 0);

  /* No AI use yet this session: no chrome. */
  if (totalRequests === 0) return null;

  const last = stats?.last ?? null;
  const contextPercent =
    last && last.context_window
      ? Math.min(100, (last.prompt_tokens / last.context_window) * 100)
      : null;

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Session token usage: ${totalTokens} tokens across ${totalRequests} requests. Show breakdown`}
        className="font-mono text-2xs text-text-3 hover:text-text-1 transition-colors"
      >
        {formatTokens(totalTokens)} tokens
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 z-40 w-[300px] border border-border bg-surface
                     shadow-xl p-3 text-left"
          role="dialog"
          aria-label="Token usage this session"
        >
          {last && (
            <div className="mb-3">
              <p className="text-2xs font-mono tracking-widest uppercase text-text-4 mb-1">
                Last request
              </p>
              <p className="text-xs text-text-2">
                {last.model || last.provider}
                {last.auto_selected && <span className="text-accent font-mono"> · auto</span>}
              </p>
              <p className="text-2xs font-mono text-text-4 mt-0.5">
                {formatTokens(last.prompt_tokens)} in · {formatTokens(last.completion_tokens)} out
                {last.context_window && contextPercent !== null
                  ? ` · context ${formatTokens(last.prompt_tokens)} of ${formatTokens(last.context_window)} (${contextPercent < 1 ? "<1" : contextPercent.toFixed(0)}%)`
                  : ""}
              </p>
              {contextPercent !== null && (
                <div
                  className="h-1 mt-1.5 bg-surface-2 border border-border overflow-hidden"
                  role="img"
                  aria-label={`Context window ${contextPercent.toFixed(0)} percent full on the last request`}
                >
                  <div
                    className={cn(
                      "h-full transition-all",
                      contextPercent > 85 ? "bg-amber-500" : "bg-accent",
                    )}
                    style={{ width: `${Math.max(contextPercent, 2)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <p className="text-2xs font-mono tracking-widest uppercase text-text-4 mb-1">
            This session by model
          </p>
          <div className="space-y-1.5">
            {[...models]
              .sort(
                (a, b) =>
                  b.prompt_tokens + b.completion_tokens - (a.prompt_tokens + a.completion_tokens),
              )
              .map((m) => {
                const used = m.prompt_tokens + m.completion_tokens;
                const share = totalTokens > 0 ? (used / totalTokens) * 100 : 0;
                return (
                  <div key={`${m.provider}:${m.model}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-text-2 truncate">{m.model || m.provider}</span>
                      <span className="text-2xs font-mono text-text-4 shrink-0">
                        {formatTokens(used)} · {m.requests} req · {share.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1 mt-0.5 bg-surface-2 overflow-hidden" aria-hidden="true">
                      <div className="h-full bg-accent-dim" style={{ width: `${Math.max(share, 2)}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>

          <p className="text-2xs text-text-4 mt-2.5">
            Counts come from the providers themselves and reset when the app closes.
          </p>
        </div>
      )}
    </div>
  );
}
