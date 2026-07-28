/*
 * Name: source-picker.tsx
 * Purpose: Choose which documents a generation reads from.
 * Description: The generation features took a notebook and nothing else, so
 *   they silently sampled whatever the notebook happened to hold, capped at
 *   twenty chunks. With one long PDF and one short note in the same notebook,
 *   the short note could be missed entirely and there was no way to say "use
 *   this one". Worse, the user could not tell what had been read after the
 *   fact, so a thin answer looked like a bad model rather than a bad selection.
 *
 *   This makes the scope explicit and visible before the work starts. Selecting
 *   nothing keeps the old behaviour, which is the right default for a notebook
 *   that holds one thing.
 *
 *   Only processed documents are offered. One that is still parsing has no
 *   chunks yet, so picking it would produce an empty context and an error that
 *   reads like the feature is broken.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

import { useDocuments } from "@/features/documents/hooks/use-documents";

interface Props {
  notebookId: string | undefined;
  /** Selected document ids. Empty means the whole notebook. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Hidden while a generation runs, so the scope cannot change under it. */
  disabled?: boolean;
}

export function SourcePicker({ notebookId, value, onChange, disabled = false }: Props) {
  const { data: documents } = useDocuments(notebookId);
  const ready = (documents ?? []).filter((d) => d.status === "processed");

  if (ready.length === 0) return null;

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <fieldset className="mb-4" disabled={disabled}>
      <legend className="text-xs font-mono tracking-widest uppercase text-text-4 mb-2">
        Sources
      </legend>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={value.length === 0}
          onClick={() => onChange([])}
          className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
            value.length === 0
              ? "border-accent-dim text-text-1 bg-surface-2"
              : "border-border text-text-3 hover:text-text-1"
          }`}
        >
          All {ready.length} {ready.length === 1 ? "document" : "documents"}
        </button>

        {ready.map((doc) => (
          <button
            key={doc.id}
            type="button"
            aria-pressed={value.includes(doc.id)}
            onClick={() => toggle(doc.id)}
            title={doc.title}
            className={`px-3 py-1.5 text-xs font-mono border transition-colors max-w-[18rem] truncate ${
              value.includes(doc.id)
                ? "border-accent-dim text-text-1 bg-surface-2"
                : "border-border text-text-3 hover:text-text-1"
            }`}
          >
            {doc.title}
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-text-4">
        {value.length === 0
          ? "Reading across the whole notebook."
          : `Reading ${value.length} of ${ready.length}.`}
      </p>
    </fieldset>
  );
}
