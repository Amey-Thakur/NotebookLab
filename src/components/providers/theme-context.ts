/*
 * Name: theme-context.ts
 * Purpose: Theme context definition and consumer hook.
 * Description: Lives apart from the provider component so the provider file
 *   exports only a component, keeping React Fast Refresh reliable.
 * Tech Stack: React 19
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
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
