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
  useMemo,
  useState,
  type ReactNode,
} from "react";


type Theme = "light" | "dark" | "system";

const VALID_THEMES: Theme[] = ["light", "dark", "system"];

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
    return VALID_THEMES.includes(stored as Theme) ? (stored as Theme) : "dark";
  });

  /* Track OS preference only when user has selected "system" mode */
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSystemTheme(mql.matches ? "dark" : "light");
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


export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
