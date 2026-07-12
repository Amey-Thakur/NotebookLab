/*
 * Name: vite.config.ts
 * Purpose: Single build configuration for bundling, styling, and tests.
 * Description: Path alias @ maps to src/ for clean imports. Tauri requires
 *   clearScreen false and a fixed dev port by convention. PostCSS runs
 *   Tailwind and Autoprefixer inline, and the vitest section drives the
 *   unit tests, so the project needs exactly one frontend config file.
 * Tech Stack: Vite, React, Tailwind CSS, Vitest, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

/// <reference types="vitest/config" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";


export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },

  /* Tauri dev server configuration */
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "localhost",
  },

  build: {
    /* Tauri uses Chromium, target modern JS */
    target: "esnext",
    /* Reduce chunk warnings threshold */
    chunkSizeWarningLimit: 1000,
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
