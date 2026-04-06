/*
 * Title: app-header.tsx
 * Tech Stack: React 19, Tailwind CSS, Tauri v2
 * Description: Top application bar with hamburger toggle, brand, and search trigger.
 * Important Details: Hamburger button visible only on mobile (<768px). Brand text
 *   is larger and bolder than nav items for clear visual hierarchy.
 */


interface AppHeaderProps {
  onToggleSidebar: () => void;
}


export function AppHeader({ onToggleSidebar }: AppHeaderProps) {
  return (
    <header
      className="flex items-center justify-between h-10 px-4 border-b border-border bg-bg select-none"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-3">
        {/* Hamburger - mobile only */}
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={onToggleSidebar}
          className="md:hidden text-text-3 hover:text-text-1 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>

        <span className="font-display text-base font-bold tracking-tight text-text-1">
          NotebookLab
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Open search (Ctrl+K)"
          className="hidden sm:flex px-3 py-1 text-xs font-mono text-text-4 bg-surface-2 border border-border
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
