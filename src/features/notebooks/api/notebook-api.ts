/*
 * Name: notebook-api.ts
 * Purpose: Tauri IPC wrappers for notebook commands.
 * Description: Each function maps to a Rust #[tauri::command] handler. All
 *   functions use the centralized tauriInvoke wrapper for
 *   consistent error handling. Types mirror the Rust models
 *   exactly.
 * Tech Stack: TypeScript, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { tauriInvoke } from "@/services/tauri-client";
import type { Notebook } from "@/types/models";

export type { Notebook };

export interface CreateNotebookInput {
  name: string;
  description?: string;
  color?: string;
}


export function listNotebooks(): Promise<Notebook[]> {
  return tauriInvoke<Notebook[]>("list_notebooks");
}

export function getNotebook(id: string): Promise<Notebook> {
  return tauriInvoke<Notebook>("get_notebook", { id });
}

export function createNotebook(input: CreateNotebookInput): Promise<Notebook> {
  return tauriInvoke<Notebook>("create_notebook", { input });
}

export function deleteNotebook(id: string): Promise<void> {
  return tauriInvoke<void>("delete_notebook", { id });
}
