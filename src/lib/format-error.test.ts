/*
 * Name: format-error.test.ts
 * Purpose: Tests for the user-facing error formatter.
 * Description: Covers prefix stripping, hint mapping, and fallbacks so IPC
 *   noise never reaches users unchanged.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { describe, expect, it } from "vitest";

import { formatError } from "./format-error";
import { TauriError } from "@/services/tauri-client";

describe("formatError", () => {
  it("strips the command prefix from TauriError messages", () => {
    const error = new TauriError("get_note", "Note not found: abc");
    expect(formatError(error)).toBe("Note not found: abc");
  });

  it("maps missing-provider errors to actionable guidance", () => {
    const error = new TauriError(
      "send_chat_message",
      "Provider error: No active provider. Select a model first.",
    );
    expect(formatError(error)).toContain("Open Models");
  });

  it("maps connection failures to a plain-language hint", () => {
    const error = new Error("error sending request for url (http://127.0.0.1:11434)");
    expect(formatError(error)).toContain("Could not reach the AI provider");
  });

  it("passes through unknown errors after cleaning", () => {
    expect(formatError(new Error("Disk quota exceeded"))).toBe("Disk quota exceeded");
  });

  it("handles non-Error values and empty messages", () => {
    expect(formatError("plain string failure")).toBe("plain string failure");
    expect(formatError("")).toBe("Something went wrong. Please try again.");
  });
});
