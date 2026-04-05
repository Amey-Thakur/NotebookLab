/*
 * Title: tauri-client.ts
 * Tech Stack: Tauri v2, TypeScript
 * Description: Typed wrapper around Tauri's invoke() for frontend-to-backend IPC.
 * Important Details: Centralizes all Tauri invoke calls with error handling.
 *   Every feature's api/ folder calls through this layer rather than importing
 *   @tauri-apps/api directly. This enables mocking in tests and consistent error handling.
 */

import { invoke } from "@tauri-apps/api/core";


/**
 * Type-safe Tauri command invocation with standardized error handling.
 * Wraps @tauri-apps/api/core invoke() to catch Rust-side errors and
 * convert them into structured frontend errors.
 */
export async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    /* Tauri serializes Rust errors as strings */
    const message = typeof error === "string" ? error : String(error);
    throw new TauriError(command, message);
  }
}


export class TauriError extends Error {
  public readonly command: string;

  constructor(command: string, message: string) {
    super(`[${command}] ${message}`);
    this.name = "TauriError";
    this.command = command;
  }
}
