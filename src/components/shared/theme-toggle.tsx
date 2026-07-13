/*
 * Name: theme-toggle.tsx
 * Purpose: Animated light and dark switch for the header.
 * Description: A real toggle rather than an icon that swaps in place: a knob
 *   slides between a sun and a moon, and the side it rests on glows in the
 *   accent color. Flipping it sets an explicit light or dark choice; the
 *   three-way control including "system" still lives in Settings. The slide is
 *   a transform transition, so reduced-motion users get an instant, silent flip.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useTheme } from "@/components/providers/theme-context";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark theme"
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative h-7 w-[52px] rounded-full border border-border bg-surface-2
                 hover:border-border-hover focus-visible:border-accent transition-colors"
    >
      {/* Sliding knob; rests left for light, right for dark */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0.5 left-0.5 h-6 w-6 rounded-full border border-border bg-surface",
          "transition-transform duration-200 ease-out",
          isDark ? "translate-x-6" : "translate-x-0",
        )}
      />

      {/* Sun, left half */}
      <svg
        aria-hidden="true"
        className={cn(
          "absolute left-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors",
          isDark ? "text-text-4" : "text-accent",
        )}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>

      {/* Moon, right half */}
      <svg
        aria-hidden="true"
        className={cn(
          "absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors",
          isDark ? "text-accent" : "text-text-4",
        )}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}
