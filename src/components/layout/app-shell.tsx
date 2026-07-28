/*
 * Name: app-shell.tsx
 * Purpose: Main application chrome.
 * Description: Renders sidebar, header, and content area. Sidebar collapses
 *   on mobile (<768px) behind a hamburger toggle; Escape closes it
 *   and the backdrop is aria-hidden. Global keyboard shortcuts
 *   live here: Ctrl+K toggles the command palette and Ctrl+N
 *   creates a note in the active notebook (Cmd on macOS). A
 *   persisted active-notebook id that no longer exists is cleared
 *   so pages never query a dangling notebook.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { bindExternalLinks } from "@/services/external-link";
import { flushAllAutosaves } from "@/lib/autosave";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { GO_TO, GO_TO_LEADER, isTypingTarget } from "@/lib/shortcuts";
import { useNotebookStore } from "@/stores/notebook-store";
import { useNotebooks } from "@/features/notebooks/hooks/use-notebooks";
import { useOpenWith } from "@/features/documents/hooks/use-open-with";
import type { Note } from "@/types/models";

import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { StatusBar } from "./status-bar";
import { CommandPalette } from "@/components/shared/command-palette";
import { ShortcutsSheet } from "@/components/shared/shortcuts-sheet";
import { WelcomeDialog } from "@/features/welcome/components/welcome-dialog";
import { ProductTour } from "@/features/welcome/components/product-tour";
import { useFirstRun } from "@/features/welcome/hooks/use-first-run";
import { useTourStore, hasSeenTour } from "@/stores/tour-store";
import { useJobChannel } from "@/features/jobs/use-job-channel";


interface AppShellProps {
  children: ReactNode;
}


export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const setActiveNotebook = useNotebookStore((s) => s.setActiveNotebook);
  const { data: notebooks } = useNotebooks();
  const welcome = useFirstRun();
  const tourOpen = useTourStore((s) => s.isOpen);
  const startTour = useTourStore((s) => s.start);
  const finishTour = useTourStore((s) => s.finish);

  /* Land the tour's final "Open Getting Started" on the sample notebook so a new
     user goes straight from the intro to trying it on real content. */
  const openSampleNotebook = () => {
    const sample = notebooks?.find((nb) => nb.name === "Getting Started") ?? notebooks?.[0];
    if (sample) {
      setActiveNotebook(sample.id);
      navigate(`/notebooks/${sample.id}`);
    }
    finishTour();
  };

  /* Timestamp of the last "g" leader press, so a following key completes a
     go-to sequence only if it lands within the window below. */
  const goLeaderAt = useRef(0);

  /* Route external http(s) link clicks through the system browser. In a Tauri
     webview a plain anchor to an external origin does nothing otherwise. */
  useEffect(() => bindExternalLinks(), []);

  /* Files opened from the OS ("Open with NotebookLab"), at launch or while
     running, are imported into a notebook and brought on screen. */
  useOpenWith();

  /* Listen for background generations here, above the router, so switching
     features never tears down the subscription. A feature page reads the job it
     started out of the store; it does not own the work. */
  useJobChannel();

  /* Save pending edits before the app closes. The note editor, canvas, and the
     in-place notebook rename autosave debounced and flush on route changes, but
     a hard window close or reload can fire mid-debounce, before that flush runs.
     Here we flush every registered editor and wait for the writes to land. The
     Tauri window stays alive until we destroy it, so the awaited saves finish; a
     cap still closes the window if a save ever hangs. pagehide covers reloads,
     where we cannot await. */
  useEffect(() => {
    const onPageHide = () => {
      void flushAllAutosaves();
    };
    window.addEventListener("pagehide", onPageHide);

    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      import("@tauri-apps/api/window")
        .then(async ({ getCurrentWindow }) => {
          const appWindow = getCurrentWindow();
          /* One click must always be enough to close. The flush is best
             effort behind a cap, destroy always runs, and if destroy is ever
             refused the next close request passes through untouched instead
             of being prevented into a window that can never close. */
          let closing = false;
          const stop = await appWindow.onCloseRequested(async (event) => {
            if (closing) return;
            closing = true;
            event.preventDefault();
            try {
              const cap = new Promise((resolve) => setTimeout(resolve, 2000));
              await Promise.race([flushAllAutosaves(), cap]);
            } catch {
              /* A failed save must not hold the window hostage. */
            }
            await appWindow.destroy().catch(() => {
              /* Destroy refused: leave closing latched so the next click
                 skips preventDefault and the OS close proceeds natively. */
            });
          });
          if (disposed) stop();
          else unlisten = stop;
        })
        .catch(() => {
          /* Not a Tauri window after all; pagehide still covers reloads. */
        });
    }

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", onPageHide);
      unlisten?.();
    };
  }, []);

  /* Drop a persisted active notebook that no longer exists (fresh database,
     data reset) so scoped pages show their real empty states. */
  useEffect(() => {
    if (activeNotebookId && notebooks && !notebooks.some((nb) => nb.id === activeNotebookId)) {
      setActiveNotebook(null);
    }
  }, [activeNotebookId, notebooks, setActiveNotebook]);

  /* Global shortcuts. Modifier chords work while typing but stand down when a
     dialog is open above them; single-key and "g then key" navigation defer to
     typing and to any open dialog. Nothing ever acts behind an overlay or
     hijacks a letter meant for an input. Ctrl+S is handled by the editor page
     itself. */
  useEffect(() => {
    const GO_WINDOW_MS = 900;

    const handleKeydown = (event: KeyboardEvent) => {
      const dialogAbovePalette = shortcutsOpen || welcome.shouldShow || tourOpen;

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "k") {
          /* Toggling the palette under another open dialog would mount it
             behind the scrim and steal focus into an invisible input. */
          if (dialogAbovePalette) return;
          event.preventDefault();
          setPaletteOpen((current) => !current);
        } else if (key === "n") {
          /* Creating and navigating behind an open dialog would act on a
             page the user cannot see. */
          if (paletteOpen || dialogAbovePalette) return;
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
        return;
      }

      /* Below here: no modifier. Never steal a key from a field or a dialog. */
      if (event.altKey || isTypingTarget(event.target)) return;
      if (paletteOpen || shortcutsOpen || welcome.shouldShow || tourOpen) return;

      if (event.key === "?") {
        event.preventDefault();
        goLeaderAt.current = 0;
        setShortcutsOpen(true);
        return;
      }

      const key = event.key.toLowerCase();
      const armed = Date.now() - goLeaderAt.current < GO_WINDOW_MS;
      if (armed) {
        goLeaderAt.current = 0;
        const route = GO_TO[key];
        if (route) {
          event.preventDefault();
          navigate(route);
        }
        return;
      }
      if (key === GO_TO_LEADER) {
        goLeaderAt.current = Date.now();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [navigate, queryClient, paletteOpen, shortcutsOpen, welcome.shouldShow, tourOpen]);

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
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <WelcomeDialog
        open={welcome.shouldShow}
        onFinish={() => {
          welcome.dismiss();
          /* Roll straight into the "how it works" tour on a fresh install. */
          if (!hasSeenTour()) startTour();
        }}
      />
      {tourOpen && <ProductTour open onFinish={finishTour} onOpenSample={openSampleNotebook} />}

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
