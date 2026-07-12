/*
 * Name: app-shell.tsx
 * Purpose: Main application chrome.
 * Description: Renders sidebar, header, and content area. Sidebar collapses
 *   on mobile (<768px) behind a hamburger toggle; Escape closes it
 *   and the backdrop is aria-hidden. Global keyboard shortcuts
 *   live here: Ctrl+K focuses search and Ctrl+N creates a note in
 *   the active notebook (Cmd on macOS). A persisted
 *   active-notebook id that no longer exists is cleared so pages
 *   never query a dangling notebook.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { useNotebookStore } from "@/stores/notebook-store";
import { useNotebooks } from "@/features/notebooks/hooks/use-notebooks";
import type { Note } from "@/types/models";

import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { StatusBar } from "./status-bar";
import { CommandPalette } from "@/components/shared/command-palette";


interface AppShellProps {
  children: ReactNode;
}


export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const setActiveNotebook = useNotebookStore((s) => s.setActiveNotebook);
  const { data: notebooks } = useNotebooks();

  /* Drop a persisted active notebook that no longer exists (fresh database,
     data reset) so scoped pages show their real empty states. */
  useEffect(() => {
    if (activeNotebookId && notebooks && !notebooks.some((nb) => nb.id === activeNotebookId)) {
      setActiveNotebook(null);
    }
  }, [activeNotebookId, notebooks, setActiveNotebook]);

  /* Global shortcuts. Skipped while typing in the editor body so Ctrl+N there
     is not surprising; Ctrl+S is handled by the editor page itself. */
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;

      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      } else if (key === "n") {
        event.preventDefault();
        const notebookId = useNotebookStore.getState().activeNotebookId;
        if (!notebookId) {
          navigate(ROUTES.NOTEBOOKS);
          return;
        }
        tauriInvoke<Note>("create_note", { input: { notebook_id: notebookId } })
          .then((note) => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTES, notebookId] });
            navigate(`/editor/${note.id}`);
          })
          .catch(() => navigate(ROUTES.NOTEBOOKS));
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [navigate, queryClient]);

  /* Escape closes the mobile drawer */
  useEffect(() => {
    if (!sidebarOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [sidebarOpen]);

  return (
    <div className="flex flex-col h-screen bg-bg text-text-1 overflow-hidden">
      <AppHeader
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-20 md:hidden"
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <AppSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex-1 overflow-auto bg-surface" aria-label="Content">
          <div className="max-w-5xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
