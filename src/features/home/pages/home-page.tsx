/*
 * Name: home-page.tsx
 * Purpose: The app's home: a calm landing that orients you and gets you moving.
 * Description: The first screen after launch. It greets you by time of day,
 *   offers the four things people reach for most (write, import, ask, search),
 *   brings back the notes you were last in, and previews your notebooks. It
 *   reads real data, degrades to a warm empty state on a fresh install, and is
 *   fully keyboard operable. Spacious and quiet by design, so the work is the
 *   loudest thing on the page.
 * Tech Stack: React 19, TanStack Query, React Router, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { BrandMark } from "@/components/shared/brand-mark";
import { useNotebookStore } from "@/stores/notebook-store";
import { useNotebooks } from "@/features/notebooks/hooks/use-notebooks";
import type { Note, RecentNote } from "@/types/models";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const setActiveNotebook = useNotebookStore((s) => s.setActiveNotebook);

  const { data: notebooks } = useNotebooks();
  const { data: recentNotes } = useQuery({
    queryKey: [QUERY_KEYS.NOTES, "recent"],
    queryFn: () => tauriInvoke<RecentNote[]>("list_recent_notes", { limit: 4 }),
  });
  const { data: chunkCount } = useQuery({
    queryKey: [QUERY_KEYS.CHUNK_COUNT],
    queryFn: () => tauriInvoke<number>("get_chunk_count"),
  });

  const newNote = () => {
    if (!activeNotebookId) {
      navigate(ROUTES.NOTEBOOKS);
      return;
    }
    tauriInvoke<Note>("create_note", { input: { notebook_id: activeNotebookId } })
      .then((note) => {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTES, activeNotebookId] });
        navigate(`/editor/${note.id}`);
      })
      .catch(() => navigate(ROUTES.NOTEBOOKS));
  };

  const actions = [
    { label: "New note", hint: "Start writing", onClick: newNote, icon: <IconPencil /> },
    { label: "Import a document", hint: "PDF, text, or Markdown", onClick: () => navigate(ROUTES.DOCUMENTS), icon: <IconImport /> },
    { label: "Ask a question", hint: "Chat with your sources", onClick: () => navigate(ROUTES.CHAT), icon: <IconChat /> },
    { label: "Search everything", hint: "Notes and documents", onClick: () => navigate(ROUTES.SEARCH), icon: <IconSearch /> },
  ];

  const openRecent = (note: RecentNote) => {
    setActiveNotebook(note.notebook_id);
    navigate(`/editor/${note.id}`);
  };

  const openNotebook = (id: string) => {
    setActiveNotebook(id);
    navigate(`/notebooks/${id}`);
  };

  const hasNotebooks = (notebooks?.length ?? 0) > 0;
  const hasRecents = (recentNotes?.length ?? 0) > 0;
  const isEmpty = notebooks !== undefined && !hasNotebooks && !hasRecents;

  return (
    <div className="px-8 py-14 max-w-4xl mx-auto">
      {/* Greeting */}
      <header className="mb-14">
        <div className="flex items-center gap-2.5 mb-4">
          <BrandMark className="h-6 w-6" />
          <span className="font-mono text-2xs uppercase tracking-[3px] text-text-4">NotebookLab</span>
        </div>
        <h1 className="font-display text-4xl font-bold text-text-1 tracking-tight">{greeting()}</h1>
        <p className="mt-3 font-body text-lg text-text-2 leading-relaxed max-w-xl">
          A private place to think. Everything here stays on your machine.
        </p>
      </header>

      {/* Quick actions */}
      <section className="mb-14" aria-label="Quick actions">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="group text-left p-5 border border-border bg-surface hover:border-accent-dim
                         focus-visible:border-accent outline-none transition-colors"
            >
              <span className="flex h-9 w-9 items-center justify-center border border-border text-accent
                               group-hover:border-accent-dim transition-colors">
                {action.icon}
              </span>
              <p className="mt-4 text-sm font-semibold text-text-1">{action.label}</p>
              <p className="mt-1 text-xs text-text-3">{action.hint}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Empty state for a fresh install */}
      {isEmpty && (
        <section className="border border-border bg-surface px-8 py-16 text-center">
          <div className="flex justify-center mb-5">
            <BrandMark className="h-12 w-12" />
          </div>
          <h2 className="font-display text-xl font-bold text-text-1 mb-2">Start with one document</h2>
          <p className="font-body text-sm text-text-2 max-w-md mx-auto mb-7 leading-relaxed">
            Create a notebook, drop in a PDF or a note, and ask the AI what it says. Nothing you
            add ever leaves this machine.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to={ROUTES.NOTEBOOKS}
              className="px-4 py-2 text-sm font-mono bg-primary text-on-primary hover:bg-primary-hover transition-colors"
            >
              Create a notebook
            </Link>
            <Link
              to={ROUTES.DOCUMENTS}
              className="px-4 py-2 text-sm font-mono border border-border text-text-3
                         hover:text-text-1 hover:border-border-hover transition-colors"
            >
              Import a document
            </Link>
          </div>
        </section>
      )}

      {/* Pick up where you left off */}
      {hasRecents && (
        <section className="mb-14">
          <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4">
            Pick up where you left off
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentNotes!.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => openRecent(note)}
                className="text-left p-4 border border-border bg-surface hover:border-accent-dim
                           focus-visible:border-accent outline-none transition-colors"
              >
                <p className="text-sm font-medium text-text-1 truncate">{note.title}</p>
                <p className="text-2xs font-mono text-text-4 mt-1 truncate">
                  {note.notebook_name} &middot; {new Date(note.updated_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Notebooks preview */}
      {hasNotebooks && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono tracking-widest uppercase text-text-4">Your notebooks</h2>
            <Link to={ROUTES.NOTEBOOKS} className="text-xs font-mono text-text-4 hover:text-text-2 transition-colors">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {notebooks!.slice(0, 6).map((nb) => (
              <div
                key={nb.id}
                role="button"
                tabIndex={0}
                aria-label={`Open notebook ${nb.name}`}
                onClick={() => openNotebook(nb.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openNotebook(nb.id);
                  }
                }}
                className="border border-border bg-surface p-5 cursor-pointer hover:border-accent-dim
                           focus-visible:border-accent outline-none transition-colors"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: nb.color }} />
                </div>
                <h3 className="text-sm font-semibold text-text-1 mb-1 truncate">{nb.name}</h3>
                {nb.description && <p className="text-xs text-text-3 line-clamp-2">{nb.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quiet footer stat */}
      {(hasNotebooks || (chunkCount ?? 0) > 0) && (
        <p className="mt-14 text-2xs font-mono text-text-4">
          {notebooks?.length ?? 0} {notebooks?.length === 1 ? "notebook" : "notebooks"}
          {(chunkCount ?? 0) > 0 && ` · ${chunkCount} passages indexed`}
        </p>
      )}
    </div>
  );
}

/* Line icons, drawn in the accent color by their parent */
function IconPencil() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
function IconImport() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M8 11l4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l.8-5.5A8 8 0 1 1 21 12z" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
