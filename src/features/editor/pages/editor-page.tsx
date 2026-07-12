/*
 * Name: editor-page.tsx
 * Purpose: Full editor view for a single note: title, Milkdown editor,
 *   save-status indicator, and a backlinks panel.
 * Description: Auto-save runs debounced and flushes on unmount so the last
 *   edit is never dropped. Every successful save writes the fresh
 *   note back into the query cache; without that, the 5-minute
 *   staleTime could resurrect old content and silently overwrite
 *   newer edits. Save failures surface in the status indicator
 *   instead of dying in the console. Clicking a [[wiki-link]]
 *   resolves (or creates) the target note.
 * Tech Stack: React 19, React Router, Milkdown, TanStack Query
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { debounce } from "@/lib/utils";
import { formatError } from "@/lib/format-error";
import { EDITOR_AUTOSAVE_MS, QUERY_KEYS } from "@/lib/constants";

import type { Note } from "@/types/models";
import { MilkdownEditor } from "../components/milkdown-editor";


export function EditorPage() {
  const { id } = useParams<{ id: string }>();

  const { data: note, isLoading, error } = useQuery({
    queryKey: [QUERY_KEYS.NOTE, id],
    queryFn: () => tauriInvoke<Note>("get_note", { id }),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-text-3">
        Loading...
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex items-center justify-center h-full text-error">
        {error ? formatError(error) : "Note not found"}
      </div>
    );
  }

  /* Key-based remount initializes NoteEditor with fresh note data */
  return <NoteEditor key={note.id} note={note} />;
}


type SaveState = "idle" | "saving" | "saved" | "error";

/* Separate component so title state initializes from props on mount, not via effect */
function NoteEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: backlinks } = useQuery({
    queryKey: [QUERY_KEYS.BACKLINKS, note.id],
    queryFn: () => tauriInvoke<Note[]>("get_backlinks", { note_id: note.id }),
  });

  const persistNote = useCallback(
    (noteId: string, input: { content?: string; title?: string }) => {
      setSaveState("saving");
      tauriInvoke<Note>("update_note", { id: noteId, input })
        .then((fresh) => {
          setSaveState("saved");
          setSaveError(null);
          /* Keep the cache in step with the database so a remount never
             restores stale content over what was just written. */
          queryClient.setQueryData([QUERY_KEYS.NOTE, noteId], fresh);
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTES, fresh.notebook_id] });
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.BACKLINKS] });
        })
        .catch((e) => {
          setSaveState("error");
          setSaveError(formatError(e));
        });
    },
    [queryClient],
  );

  const saveContent = useMemo(() => {
    return debounce((noteId: string, markdown: string) => {
      persistNote(noteId, { content: markdown });
    }, EDITOR_AUTOSAVE_MS);
  }, [persistNote]);

  /* Flush (not cancel) on unmount: edits made in the last two seconds before
     navigating away still reach the database. */
  useEffect(() => {
    return () => saveContent.flush();
  }, [saveContent]);

  const handleContentChange = useCallback(
    (markdown: string) => {
      saveContent(note.id, markdown);
    },
    [note.id, saveContent],
  );

  const saveTitle = useCallback(() => {
    if (!title.trim() || title.trim() === note.title) return;
    persistNote(note.id, { title: title.trim() });
  }, [note.id, note.title, title, persistNote]);

  /* Ctrl+S / Cmd+S flushes the pending auto-save immediately */
  const saveContentRef = useRef(saveContent);
  useEffect(() => {
    saveContentRef.current = saveContent;
  }, [saveContent]);
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveContentRef.current.flush();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const openWikiLink = useCallback(
    (linkTitle: string) => {
      /* Persist any pending edit before leaving, then resolve or create */
      saveContentRef.current.flush();
      tauriInvoke<Note>("resolve_wiki_link", {
        notebook_id: note.notebook_id,
        title: linkTitle,
      })
        .then((target) => navigate(`/editor/${target.id}`))
        .catch((e) => {
          setSaveState("error");
          setSaveError(formatError(e));
        });
    },
    [note.notebook_id, navigate],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 flex items-baseline gap-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          aria-label="Note title"
          className="flex-1 text-xl font-body font-semibold text-text-1 bg-transparent
                     border-none outline-none focus-visible:underline placeholder:text-text-4"
          placeholder="Untitled"
        />
        <SaveIndicator state={saveState} error={saveError} />
      </div>

      <div className="flex-1 overflow-auto px-8 py-4">
        <MilkdownEditor
          defaultValue={note.content}
          onChange={handleContentChange}
          onWikiLinkClick={openWikiLink}
          className="min-h-[400px]"
        />

        {backlinks && backlinks.length > 0 && (
          <nav aria-label="Backlinks" className="mt-10 pt-4 border-t border-border max-w-prose">
            <p className="text-[10px] font-mono tracking-widest uppercase text-text-4 mb-2">
              Linked from
            </p>
            <ul className="space-y-1">
              {backlinks.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/editor/${source.id}`)}
                    className="text-sm text-text-3 hover:text-accent focus-visible:text-accent
                               transition-colors"
                  >
                    {source.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}


function SaveIndicator({ state, error }: { state: SaveState; error: string | null }) {
  if (state === "idle") return null;

  if (state === "error") {
    return (
      <span role="alert" className="text-xs font-mono text-error shrink-0" title={error ?? undefined}>
        Not saved. {error}
      </span>
    );
  }

  return (
    <span aria-live="polite" className="text-xs font-mono text-text-4 shrink-0">
      {state === "saving" ? "Saving..." : "Saved"}
    </span>
  );
}
