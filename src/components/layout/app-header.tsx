/*
 * Name: app-header.tsx
 * Purpose: Top application bar with hamburger toggle, brand, and search
 *   trigger.
 * Description: Hamburger button visible only on mobile (<768px). The search
 *   button navigates to the Search page; the same route is bound
 *   to Ctrl+K globally in AppShell, so the visible kbd hint is
 *   real.
 * Tech Stack: React 19, Tailwind CSS, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useTheme } from "@/components/providers/theme-context";


interface AppHeaderProps {
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
}


export function AppHeader({ onToggleSidebar, onOpenPalette }: AppHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";

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
          aria-label="Open the command palette (Ctrl+K)"
          className="hidden sm:flex px-3 py-1 text-xs font-mono text-text-3 bg-surface-2 border border-border
                     hover:border-border-hover focus-visible:border-accent transition-colors"
          onClick={onOpenPalette}
        >
          Jump to...
          <kbd className="ml-2 text-text-4" aria-hidden="true">Ctrl+K</kbd>
        </button>

        <button
          type="button"
          aria-label={`Switch to ${nextTheme} theme`}
          title={`Switch to ${nextTheme} theme`}
          onClick={() => setTheme(nextTheme)}
          className="flex items-center justify-center w-7 h-7 text-text-3 border border-border
                     hover:text-text-1 hover:border-border-hover focus-visible:border-accent
                     transition-colors"
        >
          {resolvedTheme === "dark" ? (
            /* Sun: clicking moves to the light theme */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            /* Moon: clicking moves to the dark theme */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
