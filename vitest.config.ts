/*
 * Name: vitest.config.ts
 * Purpose: Test configuration for frontend unit tests.
 * Description: Uses jsdom for DOM simulation. Path aliases match
 *   vite.config.ts. Tauri IPC calls are mocked in the test setup
 *   file.
 * Tech Stack: Vitest, React Testing Library, jsdom
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { defineConfig } from "vitest/config";
import path from "path";


export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
