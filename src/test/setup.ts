/*
 * Title: setup.ts
 * Tech Stack: Vitest, jsdom
 * Description: Global test setup. Mocks Tauri IPC and plugin APIs so frontend
 *   components can be tested without a running Tauri backend.
 * Important Details: All @tauri-apps/* imports are mocked here. Individual tests
 *   can override mocks via vi.mocked() for specific test cases.
 */

import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";


/* Mock Tauri core API */
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

/* Mock Tauri event API */
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

/* Mock Tauri dialog plugin */
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue(null),
}));
