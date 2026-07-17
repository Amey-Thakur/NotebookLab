/*
 * Name: model-switcher.tsx
 * Purpose: Header model switcher: see the active model, change it in two
 *   clicks.
 * Description: A compact header button showing a status dot and the active
 *   provider; clicking opens a popover listing every registered provider
 *   grouped into "On this computer" and "Cloud", with search, availability
 *   dots, the provider's model, and star-to-pin favorites (kept in
 *   localStorage, sorted first within their group). Activating is one click
 *   and closes the popover. When nothing is set up yet the button reads
 *   "Set up AI" and the popover points to the Models page, which the footer
 *   always links to. Closes on Escape, outside click, and route use;
 *   the trigger carries a data-tour anchor for the product tour.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ProviderInfo, UsageStats } from "@/types/models";
import {
  useProviders,
  useSetActiveProvider,
} from "@/features/model-manager/hooks/use-model-management";

const FAVORITES_KEY = "notebooklab-favorite-providers";

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* Unreadable favorites fall back to none. */
  }
  return new Set();
}

export function ModelSwitcher() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const { data: providers } = useProviders();
  const setActive = useSetActiveProvider();

  /* Auto-selection state and the last actually-used model ride on the same
     cached usage query the status-bar chip polls. */
  const { data: usage } = useQuery({
    queryKey: [QUERY_KEYS.USAGE],
    queryFn: () => tauriInvoke<UsageStats>("get_usage_stats"),
    refetchInterval: 5000,
  });
  const autoEnabled = usage?.auto_enabled ?? false;

  const setAuto = useMutation({
    mutationFn: (enabled: boolean) => tauriInvoke<void>("set_auto_model", { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USAGE] });
    },
  });

  const active = providers?.find((p) => p.is_active);

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

  /* Land focus in the search box when the popover opens. */
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const toggleFavorite = (name: string) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
      } catch {
        /* Storage unavailable: favorites just do not persist. */
      }
      return next;
    });
  };

  const { local, cloud } = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = (p: ProviderInfo) =>
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.model.toLowerCase().includes(term) ||
      p.kind.toLowerCase().includes(term);
    const sortGroup = (group: ProviderInfo[]) =>
      [...group].sort((a, b) => {
        const favA = favorites.has(a.name) ? 0 : 1;
        const favB = favorites.has(b.name) ? 0 : 1;
        if (favA !== favB) return favA - favB;
        return a.name.localeCompare(b.name);
      });
    const all = (providers ?? []).filter(matches);
    return {
      local: sortGroup(all.filter((p) => p.is_local)),
      cloud: sortGroup(all.filter((p) => !p.is_local)),
    };
  }, [providers, search, favorites]);

  const pick = (p: ProviderInfo) => {
    /* Choosing a specific model is an explicit override: auto stands down. */
    if (autoEnabled) setAuto.mutate(false);
    setActive.mutate(p.index);
    setOpen(false);
  };

  /* What the trigger shows: under auto, the mode plus the model that actually
     served the last request; otherwise the active provider and its model. */
  const triggerLabel = autoEnabled
    ? `Auto${usage?.last ? ` · ${usage.last.model || usage.last.provider}` : ""}`
    : active
      ? `${active.name}${active.model ? ` · ${active.model}` : ""}`
      : "Set up AI";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-tour="model-switcher"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={
          autoEnabled
            ? "Automatic model selection is on. Open the model menu"
            : active
              ? `Active model: ${active.name}. Switch model`
              : "Set up an AI model"
        }
        className="flex items-center gap-2 px-3 py-1 text-xs font-mono text-text-3 bg-surface-2
                   border border-border hover:border-border-hover focus-visible:border-accent
                   transition-colors max-w-[220px]"
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            autoEnabled
              ? "bg-accent"
              : active
                ? active.is_available
                  ? "bg-mark"
                  : "bg-amber-500"
                : "bg-amber-500",
          )}
        />
        <span className="truncate hidden sm:inline">{triggerLabel}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-40 w-[300px] border border-border bg-surface shadow-xl"
          role="listbox"
          aria-label="Choose a model"
        >
          <div className="p-2 border-b border-border">
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              aria-label="Search models"
              className="w-full px-2.5 py-1.5 text-xs bg-surface-2 border border-border text-text-1
                         placeholder:text-text-4 outline-none focus:border-accent-dim"
            />
          </div>

          {/* Auto mode: one honest toggle, only offered once there is more
              than one model to pick between. */}
          {(providers?.length ?? 0) > 1 && (
            <button
              type="button"
              role="switch"
              aria-checked={autoEnabled}
              onClick={() => setAuto.mutate(!autoEnabled)}
              disabled={setAuto.isPending}
              className={cn(
                "w-full text-left px-3.5 py-2.5 border-b border-border transition-colors",
                autoEnabled ? "bg-surface-2" : "hover:bg-surface-2",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs text-text-1 font-medium">Auto</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "font-mono text-2xs",
                    autoEnabled ? "text-accent" : "text-text-4",
                  )}
                >
                  {autoEnabled ? "on" : "off"}
                </span>
              </span>
              <span className="block text-2xs text-text-4 mt-0.5 leading-relaxed">
                Picks the best of your models for each task, prefers free local compute for quick
                work, and falls back if one stops answering.
              </span>
            </button>
          )}

          <div className="max-h-[320px] overflow-y-auto p-1.5">
            {local.length === 0 && cloud.length === 0 && (
              <p className="px-2.5 py-3 text-xs text-text-4 leading-relaxed">
                {providers?.length
                  ? "Nothing matches that search."
                  : "No AI model yet. Setting one up takes about a minute, and the button below walks you through it."}
              </p>
            )}

            {local.length > 0 && (
              <SwitcherGroup
                label="On this computer"
                entries={local}
                favorites={favorites}
                onPick={pick}
                onToggleFavorite={toggleFavorite}
              />
            )}
            {cloud.length > 0 && (
              <SwitcherGroup
                label="Cloud"
                entries={cloud}
                favorites={favorites}
                onPick={pick}
                onToggleFavorite={toggleFavorite}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate(ROUTES.MODELS);
            }}
            className="w-full text-left px-3.5 py-2.5 text-xs font-mono text-text-3 border-t
                       border-border hover:text-text-1 hover:bg-surface-2 transition-colors"
          >
            {providers?.length ? "Manage models →" : "Set up AI →"}
          </button>
        </div>
      )}
    </div>
  );
}

interface SwitcherGroupProps {
  label: string;
  entries: ProviderInfo[];
  favorites: Set<string>;
  onPick: (p: ProviderInfo) => void;
  onToggleFavorite: (name: string) => void;
}

function SwitcherGroup({ label, entries, favorites, onPick, onToggleFavorite }: SwitcherGroupProps) {
  return (
    <div className="mb-1.5">
      <p className="px-2 pt-1.5 pb-1 text-2xs font-mono tracking-widest uppercase text-text-4">
        {label}
      </p>
      {entries.map((p) => (
        <div key={p.index} className="group flex items-center">
          <button
            type="button"
            role="option"
            aria-selected={p.is_active}
            onClick={() => onPick(p)}
            className={cn(
              "flex-1 flex items-center gap-2 px-2 py-1.5 text-left min-w-0 transition-colors",
              p.is_active ? "bg-surface-2" : "hover:bg-surface-2",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                p.is_available ? "bg-mark" : "bg-border-hover",
              )}
              title={p.is_available ? "Available" : "Not answering"}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-text-1 truncate">{p.name}</span>
              {p.model && (
                <span className="block text-2xs font-mono text-text-4 truncate">{p.model}</span>
              )}
            </span>
            {p.is_active && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
                className="shrink-0 text-accent"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => onToggleFavorite(p.name)}
            aria-label={
              favorites.has(p.name) ? `Unpin ${p.name}` : `Pin ${p.name} to the top`
            }
            aria-pressed={favorites.has(p.name)}
            className={cn(
              "px-1.5 py-1.5 shrink-0 transition-opacity",
              favorites.has(p.name)
                ? "text-accent"
                : "text-text-4 opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill={favorites.has(p.name) ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
