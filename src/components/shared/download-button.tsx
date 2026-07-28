/*
 * Name: download-button.tsx
 * Purpose: One save control, used by every feature that produces something.
 * Description: Shared so that saving a quiz, a mind map, an audio script and a
 *   canvas all look and behave identically. A per-feature button would drift in
 *   wording and placement, and the user would have to learn each one.
 *
 *   The label says the format rather than just "Download", because the useful
 *   question at that moment is what file you are about to get.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

interface Props {
  onDownload: () => void;
  /** Shown on the button, e.g. "Markdown" or "PNG". */
  format: string;
  /** For the accessible name, e.g. "the study guide". */
  what: string;
  disabled?: boolean;
}

export function DownloadButton({ onDownload, format, what, disabled = false }: Props) {
  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={disabled}
      aria-label={`Download ${what} as ${format}`}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-border
                 text-text-3 hover:text-text-1 hover:border-accent-dim disabled:opacity-50
                 transition-colors"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 2v8m0 0L5 7m3 3 3-3" />
        <path d="M2.5 11.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1" />
      </svg>
      {format}
    </button>
  );
}
