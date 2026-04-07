/*
 * Title: tailwind.config.ts
 * Tech Stack: Tailwind CSS 3.4
 * Description: Tailwind configuration with custom design tokens mapped from CSS variables.
 * Important Details: All colors reference CSS custom properties for theme switching.
 *   Font stack: Play (display/UI), Source Serif 4 (body/editor), JetBrains Mono (code).
 *   8-point spacing grid enforced via default spacing scale.
 */

import type { Config } from "tailwindcss";


export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],

  theme: {
    /* Top-level overrides: replace Tailwind's default font stacks entirely.
       This ensures Play is the base UI font everywhere, not system-ui. */
    fontFamily: {
      sans: ['"Play"', "sans-serif"],
      display: ['"Play"', "sans-serif"],
      body: ['"Source Serif 4"', "serif"],
      serif: ['"Source Serif 4"', "serif"],
      mono: ['"JetBrains Mono"', "monospace"],
    },

    extend: {

      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        "surface-3": "var(--color-surface-3)",
        border: "var(--color-border)",
        "border-hover": "var(--color-border-hover)",
        "text-1": "var(--color-text-1)",
        "text-2": "var(--color-text-2)",
        "text-3": "var(--color-text-3)",
        "text-4": "var(--color-text-4)",
        accent: "var(--color-accent)",
        "accent-dim": "var(--color-accent-dim)",
        mark: "var(--color-mark)",
        error: "var(--color-error)",
      },

      fontSize: {
        /* Strict typographic scale */
        "2xs": ["10px", { lineHeight: "14px" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["14px", { lineHeight: "20px" }],
        base: ["16px", { lineHeight: "24px" }],
        lg: ["18px", { lineHeight: "28px" }],
        xl: ["22px", { lineHeight: "30px" }],
        "2xl": ["28px", { lineHeight: "36px" }],
        "3xl": ["36px", { lineHeight: "44px" }],
      },

      borderColor: {
        DEFAULT: "var(--color-border)",
      },
    },
  },

  plugins: [],
} satisfies Config;
