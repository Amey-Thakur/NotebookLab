/*
 * Title: editor-page.tsx
 * Tech Stack: React 19, React Router, Milkdown
 * Description: Full editor view for a single note. Includes the Milkdown editor
 *   with a title input and auto-save functionality.
 * Important Details: Note content is loaded via Tauri IPC on mount. Changes are
 *   debounced and auto-saved every 2 seconds. The note ID comes from the URL params.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { tauriInvoke } from "@/services/tauri-client";
import { debounce } from "@/lib/utils";
import { EDITOR_AUTOSAVE_MS } from "@/lib/constants";

import { MilkdownEditor } from "../components/milkdown-editor";


interface Note {
  id: string;
  notebook_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}


export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    tauriInvoke<Note>("get_note", { id })
      .then((n) => {
        setNote(n);
        setTitle(n.title);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  /* Debounced auto-save for content changes */
  const saveContent = useCallback(
    debounce((markdown: string) => {
      if (!id) return;
      tauriInvoke("update_note", { id, input: { content: markdown } }).catch(
        (e) => console.error("Auto-save failed:", e),
      );
    }, EDITOR_AUTOSAVE_MS),
    [id],
  );

  /* Save title on blur */
  const saveTitle = useCallback(() => {
    if (!id || !title.trim()) return;
    tauriInvoke("update_note", { id, input: { title: title.trim() } }).catch(
      (e) => console.error("Title save failed:", e),
    );
  }, [id, title]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-3">
        Loading...
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex items-center justify-center h-full text-error">
        {error || "Note not found"}
      </div>
    );
  }

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
          onChange={saveContent}
          className="min-h-[400px]"
        />
      </div>
    </div>
  );
}
