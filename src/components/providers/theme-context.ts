/*
 * Title: theme-context.ts
 * Tech Stack: React 19
 * Description: Theme context definition and consumer hook.
 * Important Details: Lives apart from the provider component so the provider
 *   file exports only a component, keeping React Fast Refresh reliable.
 */

import { createContext, useContext } from "react";


export type Theme = "light" | "dark" | "system";

export const VALID_THEMES: Theme[] = ["light", "dark", "system"];

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}

export const ThemeCtx = createContext<ThemeContextValue | null>(null);


export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
