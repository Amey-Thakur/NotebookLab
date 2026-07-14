/*
 * Name: editor-page.tsx
 * Purpose: Full editor view for a single note: title, Milkdown editor,
 *   live word count, Markdown export, save status, and backlinks.
 * Description: Auto-save runs debounced and flushes on unmount, on Ctrl+S, and
 *   before the app closes (via the autosave registry), so the last
 *   edit is never dropped, even on a hard quit. Every successful save writes the fresh
 *   note back into the query cache; without that, the 5-minute
 *   staleTime could resurrect old content and silently overwrite
 *   newer edits. Save failures surface in the status indicator
 *   instead of dying in the console. Clicking a [[wiki-link]]
 *   resolves (or creates) the target note. Export writes the
 *   Markdown to a user-chosen path via the native save dialog.
 * Tech Stack: React 19, React Router, Milkdown, TanStack Query
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { save } from "@tauri-apps/plugin-dialog";

import { tauriInvoke } from "@/services/tauri-client";
import { countWords, debounce } from "@/lib/utils";
import { formatError } from "@/lib/format-error";
import { useAutosaveFlush } from "@/lib/autosave";
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
  const [wordCount, setWordCount] = useState(() => countWords(note.content));
  const [exported, setExported] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: backlinks } = useQuery({
    queryKey: [QUERY_KEYS.BACKLINKS, note.id],
    queryFn: () => tauriInvoke<Note[]>("get_backlinks", { note_id: note.id }),
  });

  const persistNote = useCallback(
    (noteId: string, input: { content?: string; title?: string }) => {
      setSaveState("saving");
      return tauriInvoke<Note>("update_note", { id: noteId, input })
        .then((fresh) => {
          setSaveState("saved");
          setSaveError(null);
          /* Keep the cache in step with the database so a remount never
             restores stale content over what was just written. */
          queryClient.setQueryData([QUERY_KEYS.NOTE, noteId], fresh);
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.NOTES, fresh.notebook_id] });
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.BACKLINKS] });
          /* A save may have changed [[wiki-links]], so refresh the connections graph. */
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.GRAPH] });
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

  /* The latest editor content, mirrored so an immediate flush (unmount, Ctrl+S,
     app close) saves what is on screen rather than the last debounced value. */
  const latestContentRef = useRef(note.content);

  const handleContentChange = useCallback(
    (markdown: string) => {
      latestContentRef.current = markdown;
      setWordCount(countWords(markdown));
      saveContent(note.id, markdown);
    },
    [note.id, saveContent],
  );

  const saveTitle = useCallback(() => {
    if (!title.trim() || title.trim() === note.title) return;
    persistNote(note.id, { title: title.trim() });
  }, [note.id, note.title, title, persistNote]);

  /* Persist any unsaved title and pending content edit right now, awaiting the
     write so callers (export, the app-close flush) can rely on it landing.
     Cancels the debounce so there is no duplicate write, and no-ops when nothing
     has changed since the last save. */
  const flushNow = useCallback((): void | Promise<unknown> => {
    saveContent.cancel();
    const input: { content?: string; title?: string } = {};
    if (latestContentRef.current !== note.content) input.content = latestContentRef.current;
    const trimmed = title.trim();
    if (trimmed && trimmed !== note.title) input.title = trimmed;
    if (input.content !== undefined || input.title !== undefined) {
      return persistNote(note.id, input);
    }
  }, [saveContent, note.id, note.content, note.title, title, persistNote]);

  /* Live ref so the unmount flush and key handlers always call the latest
     flushNow without re-subscribing. */
  const flushNowRef = useRef(flushNow);
  useEffect(() => {
    flushNowRef.current = flushNow;
  });

  /* Save on a hard app close too: a quit can fire mid-debounce, before the
     unmount flush below would run. */
  useAutosaveFlush(flushNow);

  /* Flush on unmount: a pending content edit and an unsaved title edit made in
     the last moments before leaving still reach the database. */
  useEffect(() => {
    return () => {
      void flushNowRef.current();
    };
  }, []);

  /* Ctrl+S / Cmd+S saves the title and flushes the pending content auto-save. */
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flushNowRef.current();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const openWikiLink = useCallback(
    (linkTitle: string) => {
      /* Persist any pending edit before leaving, then resolve or create */
      void flushNowRef.current();
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

  /* Export the note wherever the user chooses. The chosen extension decides
     the format: .rtf becomes a Word-compatible document, .md stays Markdown.
     The native dialog handles location and overwrite confirmation. */
  const exportNote = useCallback(
    async (kind: "md" | "rtf") => {
      try {
        const filePath = await save({
          defaultPath: `${title.trim() || "note"}.${kind}`,
          filters:
            kind === "rtf"
              ? [{ name: "Word document", extensions: ["rtf"] }]
              : [{ name: "Markdown", extensions: ["md"] }],
        });
        if (!filePath) return;

        await flushNowRef.current();
        await tauriInvoke("export_note", { id: note.id, file_path: filePath });
        setExported(true);
        setTimeout(() => setExported(false), 1500);
      } catch (e) {
        setSaveState("error");
        setSaveError(formatError(e));
      }
    },
    [note.id, title],
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
        <span className="text-2xs font-mono text-text-4 shrink-0" aria-label={`${wordCount} words`}>
          {wordCount} {wordCount === 1 ? "word" : "words"}
        </span>
        {exported ? (
          <span className="shrink-0 text-2xs font-mono text-text-4">Exported</span>
        ) : (
          <span className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => exportNote("md")}
              className="px-2 py-0.5 text-2xs font-mono border border-border text-text-3
                         hover:text-text-1 hover:border-accent-dim transition-colors"
            >
              .md
            </button>
            <button
              type="button"
              onClick={() => exportNote("rtf")}
              title="Export as a Word-compatible document"
              className="px-2 py-0.5 text-2xs font-mono border border-border text-text-3
                         hover:text-text-1 hover:border-accent-dim transition-colors"
            >
              Word
            </button>
          </span>
        )}
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
