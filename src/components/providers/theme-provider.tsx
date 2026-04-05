/*
 * Title: theme-provider.tsx
 * Tech Stack: React 19
 * Description: Theme context provider supporting light, dark, and system preference modes.
 * Important Details: Persists theme choice to localStorage. System mode uses the
 *   prefers-color-scheme media query. Sets a data-theme attribute on <html> so
 *   Tailwind CSS custom properties resolve correctly.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";


type Theme = "light" | "dark" | "system";

interface ThemeContext {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

const ThemeCtx = createContext<ThemeContext | null>(null);

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
    return (stored as Theme) || "dark";
  });

  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [theme, resolvedTheme]);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeCtx.Provider>
  );
}


export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
