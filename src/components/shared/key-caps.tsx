/*
 * Name: key-caps.tsx
 * Purpose: Render a shortcut's keys as consistent key caps.
 * Description: One place decides how a chord or sequence looks, so the cheat
 *   sheet, the welcome tour, and the settings list never drift in style. The
 *   token "then" renders as a quiet connector so a sequence like G then N reads
 *   as words, not another key.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

export function KeyCaps({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      {keys.map((token, index) =>
        token === "then" ? (
          <span key={index} className="text-2xs text-text-4 px-0.5">
            then
          </span>
        ) : (
          <kbd
            key={index}
            className="min-w-[1.5rem] text-center font-mono text-xs text-text-2 bg-surface-2
                       border border-border px-2 py-0.5"
          >
            {token}
          </kbd>
        ),
      )}
    </span>
  );
}
