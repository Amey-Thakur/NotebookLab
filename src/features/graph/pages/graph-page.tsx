/*
 * Name: graph-page.tsx
 * Purpose: See how the notes in a notebook connect through wiki-links.
 * Description: Two views of the same map, toggled and remembered: a 3D cloud
 *   (Graph3D, our own engine) you can rotate, zoom, and click through, and a
 *   calm deterministic 2D circle. A dot's size reflects how many links touch
 *   it, so the hubs of a knowledge base stand out at a glance. The same
 *   adjacency is summarised into the AI's chat context (rag_service), so the
 *   page says so honestly. Clicking a note opens it. An accessible list
 *   mirrors the graph for screen readers and for notebooks with no links yet.
 * Tech Stack: React 19, TanStack Query, SVG, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { useNotebookStore } from "@/stores/notebook-store";
import type { NotesGraph } from "@/types/models";
import { Graph3D } from "../components/graph-3d";

const VIEW_KEY = "notebooklab-graph-view";


const SIZE = 520;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 60;


export function GraphPage() {
  const navigate = useNavigate();
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const [view, setView] = useState<"3d" | "2d">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "2d" ? "2d" : "3d";
    } catch {
      return "3d";
    }
  });

  const pickView = (next: "3d" | "2d") => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* Preference simply not remembered. */
    }
  };

  const openNote = useCallback((id: string) => navigate(`/editor/${id}`), [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEYS.GRAPH, activeNotebookId],
    queryFn: () => tauriInvoke<NotesGraph>("get_notes_graph", { notebook_id: activeNotebookId }),
    enabled: !!activeNotebookId,
  });

  /* Fixed positions around a circle, one slot per note */
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const nodes = data?.nodes ?? [];
    nodes.forEach((node, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      map.set(node.id, {
        x: CENTER + Math.cos(angle) * RADIUS,
        y: CENTER + Math.sin(angle) * RADIUS,
      });
    });
    return map;
  }, [data]);

  if (!activeNotebookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-3 p-8">
        <p className="text-lg mb-2">No notebook selected</p>
        <p className="text-sm text-text-4 mb-4">Open a notebook to see how its notes connect.</p>
        <Link
          to={ROUTES.NOTEBOOKS}
          className="px-4 py-2 text-sm font-mono border border-border text-text-2 hover:border-accent-dim transition-colors"
        >
          Go to Notebooks
        </Link>
      </div>
    );
  }

  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];
  const linkedNodes = nodes.filter((n) => n.degree > 0);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h1 className="text-2xl font-display font-bold text-text-1">Connections</h1>
        <div className="flex" role="group" aria-label="View">
          {(["3d", "2d"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => pickView(mode)}
              className={cn(
                "px-3 py-1 text-xs font-mono border transition-colors",
                view === mode
                  ? "border-accent-dim bg-surface-2 text-text-1"
                  : "border-border text-text-3 hover:text-text-1",
              )}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-text-3 mb-6">
        How the notes in this notebook link to each other. Larger dots have more connections.
        The same map is handed to the AI so it knows how your work fits together.
      </p>

      {isLoading && <p className="text-sm text-text-3">Loading connections...</p>}
      {error && <p role="alert" className="text-sm text-error">{formatError(error)}</p>}

      {data && nodes.length === 0 && (
        <p className="text-sm text-text-4 py-12 text-center">
          This notebook has no notes yet. Create some and link them with [[wiki-links]].
        </p>
      )}

      {data && nodes.length > 0 && linkedNodes.length === 0 && (
        <p className="text-sm text-text-4 py-12 text-center">
          No links between notes yet. Type [[a note title]] in a note to connect it to another.
        </p>
      )}

      {data && linkedNodes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
          {view === "3d" ? (
            <div className="border border-border bg-surface overflow-hidden">
              <Graph3D graph={data} onOpenNote={openNote} />
              <p className="px-3 py-2 border-t border-border text-2xs font-mono text-text-4">
                Drag to rotate · scroll to zoom · click a note to open it
              </p>
            </div>
          ) : (
          <div className="border border-border bg-surface">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="w-full h-auto"
              role="img"
              aria-label={`Connection map of ${nodes.length} notes and ${edges.length} links`}
            >
              {edges.map((edge, i) => {
                const a = positions.get(edge.source);
                const b = positions.get(edge.target);
                if (!a || !b) return null;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="var(--color-border-hover)"
                    strokeWidth={1}
                  />
                );
              })}
              {nodes.map((node) => {
                const pos = positions.get(node.id);
                if (!pos) return null;
                const r = 5 + Math.min(node.degree, 6) * 2;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x},${pos.y})`}
                    onClick={() => navigate(`/editor/${node.id}`)}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open note ${node.title}, ${node.degree} connections`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/editor/${node.id}`);
                      }
                    }}
                  >
                    <circle
                      r={r}
                      fill={node.degree > 0 ? "var(--color-accent-dim)" : "var(--color-surface-3)"}
                      stroke="var(--color-accent)"
                      strokeWidth={node.degree > 2 ? 1.5 : 0.5}
                    />
                    <title>{node.title}</title>
                  </g>
                );
              })}
            </svg>
          </div>
          )}

          {/* Accessible, always-visible index of the most connected notes */}
          <nav aria-label="Most connected notes">
            <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3">Most connected</h2>
            <ul className="space-y-1">
              {linkedNodes.slice(0, 12).map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/editor/${node.id}`)}
                    className="w-full text-left flex items-center justify-between px-2 py-1.5 text-sm
                               text-text-2 hover:text-text-1 hover:bg-surface-2 focus-visible:bg-surface-2
                               transition-colors"
                  >
                    <span className="truncate">{node.title}</span>
                    <span className="ml-2 shrink-0 text-2xs font-mono text-text-4">{node.degree}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
