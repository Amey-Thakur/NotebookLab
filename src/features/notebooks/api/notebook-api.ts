/*
 * Title: notebook-api.ts
 * Tech Stack: TypeScript, Tauri v2
 * Description: Tauri IPC wrappers for notebook commands. Each function maps to a
 *   Rust #[tauri::command] handler.
 * Important Details: All functions use the centralized tauriInvoke wrapper for
 *   consistent error handling. Types mirror the Rust models exactly.
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
