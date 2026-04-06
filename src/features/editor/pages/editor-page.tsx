/*
 * Title: editor-page.tsx
 * Tech Stack: React 19, React Router, Milkdown, TanStack Query
 * Description: Full editor view for a single note. Includes the Milkdown editor
 *   with a title input and auto-save functionality.
 * Important Details: Note content is loaded via TanStack Query. Title is tracked
 *   as local edit state, initialized from the query data via key-based remount.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { debounce } from "@/lib/utils";
import { EDITOR_AUTOSAVE_MS, QUERY_KEYS } from "@/lib/constants";

import type { Note } from "@/types/models";
import { MilkdownEditor } from "../components/milkdown-editor";


export function EditorPage() {
  const { id } = useParams<{ id: string }>();

  const { data: note, isLoading, error } = useQuery({
    queryKey: [QUERY_KEYS.NOTES, id],
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
        {error ? String(error) : "Note not found"}
      </div>
    );
  }

  /* Key-based remount initializes NoteEditor with fresh note data */
  return <NoteEditor key={note.id} note={note} />;
}


/* Separate component so title state initializes from props on mount, not via effect */
function NoteEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);

  const saveContent = useMemo(() => {
    return debounce((noteId: string, markdown: string) => {
      tauriInvoke("update_note", { id: noteId, input: { content: markdown } }).catch(
        (e) => console.error("Auto-save failed:", e),
      );
    }, EDITOR_AUTOSAVE_MS);
  }, []);

  useEffect(() => {
    return () => saveContent.cancel();
  }, [saveContent]);

  const handleContentChange = useCallback(
    (markdown: string) => {
      saveContent(note.id, markdown);
    },
    [note.id, saveContent],
  );

  const saveTitle = useCallback(() => {
    if (!title.trim()) return;
    tauriInvoke("update_note", { id: note.id, input: { title: title.trim() } }).catch(
      (e) => console.error("Title save failed:", e),
    );
  }, [note.id, title]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          className="w-full text-xl font-body font-semibold text-text-1 bg-transparent
                     border-none outline-none placeholder:text-text-4"
          placeholder="Untitled"
        />
      </div>

      <div className="flex-1 overflow-auto px-8 py-4">
        <MilkdownEditor
          defaultValue={note.content}
          onChange={handleContentChange}
          className="min-h-[400px]"
        />
      </div>
    </div>
  );
}
