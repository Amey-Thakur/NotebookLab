/*
 * Name: theme-provider.tsx
 * Purpose: Theme context provider supporting light, dark, and system
 *   preference modes.
 * Description: Persists theme choice to localStorage. System mode uses the
 *   prefers-color-scheme media query. Sets a data-theme attribute
 *   on <html> so Tailwind CSS custom properties resolve correctly.
 *   The context and useTheme hook live in theme-context.ts.
 * Tech Stack: React 19
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ThemeCtx, VALID_THEMES, type Theme } from "./theme-context";


const STORAGE_KEY = "notebooklab-theme";


function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}


export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.includes(stored as Theme) ? (stored as Theme) : "dark";
  });

  /* Track OS preference only when user has selected "system" mode */
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemTheme(mql.matches ? "dark" : "light");
    /* Re-read the OS preference the moment system mode is chosen, so it cannot
       show a stale value carried over from a manual choice. */
    handler();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  /* Memoize to prevent unnecessary re-renders of consumers */
  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, resolvedTheme],
  );

  return (
    <ThemeCtx.Provider value={value}>
      {children}
    </ThemeCtx.Provider>
  );
}
