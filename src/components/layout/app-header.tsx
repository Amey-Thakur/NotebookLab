/*
 * Title: app-header.tsx
 * Tech Stack: React 19, Tailwind CSS, Tauri v2
 * Description: Top application bar with window controls, breadcrumb, and search trigger.
 * Important Details: Uses Tauri's custom title bar region (data-tauri-drag-region) for
 *   window dragging. Search trigger opens the command palette (Cmd/Ctrl+K).
 */

export function AppHeader() {
  return (
    <header
      className="flex items-center justify-between h-10 px-4 border-b border-border bg-bg select-none"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-3">
        <span className="font-display text-sm font-bold tracking-tight text-text-1">
          NotebookLab
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Open search (Ctrl+K)"
          className="px-3 py-1 text-xs font-mono text-text-4 bg-surface-2 border border-border
                     hover:border-border-hover transition-colors"
          onClick={() => {
            /* Command palette will be wired here */
          }}
        >
          Search...
          <kbd className="ml-2 text-text-4" aria-hidden="true">Ctrl+K</kbd>
        </button>
      </div>
    </header>
  );
}
