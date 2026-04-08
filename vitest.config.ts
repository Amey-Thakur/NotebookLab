/*
 * Title: vitest.config.ts
 * Tech Stack: Vitest, React Testing Library, jsdom
 * Description: Test configuration for frontend unit tests.
 * Important Details: Uses jsdom for DOM simulation. Path aliases match vite.config.ts.
 *   Tauri IPC calls are mocked in the test setup file.
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
