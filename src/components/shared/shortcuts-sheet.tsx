/*
 * Name: shortcuts-sheet.tsx
 * Purpose: The keyboard shortcut cheat sheet, opened with "?".
 * Description: Renders the shared shortcut registry grouped by area so every
 *   binding is discoverable in one place instead of buried in menus. Because it
 *   reads the same registry the shell handler honors, the list can never claim
 *   a shortcut the app does not actually run.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { Modal } from "@/components/shared/modal";
import { KeyCaps } from "@/components/shared/key-caps";
import { SHORTCUTS, GROUP_ORDER } from "@/lib/shortcuts";

interface ShortcutsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsSheet({ open, onClose }: ShortcutsSheetProps) {
  return (
    <Modal open={open} onClose={onClose} label="Keyboard shortcuts" widthClassName="max-w-xl">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h2 className="font-display text-base font-bold text-text-1">Keyboard shortcuts</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-6 w-6 items-center justify-center text-text-4 hover:text-text-1
                     focus-visible:text-text-1 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto px-6 py-5 space-y-6">
        {GROUP_ORDER.map((group) => {
          const rows = SHORTCUTS.filter((s) => s.group === group);
          if (rows.length === 0) return null;
          return (
            <section key={group}>
              <h3 className="text-2xs font-mono uppercase tracking-widest text-text-4 mb-3">{group}</h3>
              <ul className="space-y-2">
                {rows.map((shortcut) => (
                  <li key={shortcut.id} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-text-2">{shortcut.description}</span>
                    <KeyCaps keys={shortcut.keys} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
