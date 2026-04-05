/*
 * Title: vite.config.ts
 * Tech Stack: Vite, React, Tauri v2
 * Description: Vite bundler configuration for the React frontend.
 * Important Details: Path alias @ maps to src/ for clean imports.
 *   Tauri requires clearScreen: false and server port 1420 by convention.
 *   The host is set to enable Tauri to connect to the dev server.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";


export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
});
