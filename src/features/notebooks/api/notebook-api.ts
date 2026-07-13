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

import { open, save } from "@tauri-apps/plugin-dialog";

import { tauriInvoke } from "@/services/tauri-client";
import type { Notebook } from "@/types/models";

export interface CreateNotebookInput {
  name: string;
  description?: string;
  color?: string;
}

/* The extension for an exported, self-contained notebook file. */
const NOTEBOOK_FILE_EXTENSION = "nblab";


export function listNotebooks(): Promise<Notebook[]> {
  return tauriInvoke<Notebook[]>("list_notebooks");
}

export function createNotebook(input: CreateNotebookInput): Promise<Notebook> {
  return tauriInvoke<Notebook>("create_notebook", { input });
}

export function deleteNotebook(id: string): Promise<void> {
  return tauriInvoke<void>("delete_notebook", { id });
}

export function exportNotebook(notebookId: string, destPath: string): Promise<void> {
  return tauriInvoke<void>("export_notebook", { notebook_id: notebookId, dest_path: destPath });
}

export function importNotebook(srcPath: string): Promise<string> {
  return tauriInvoke<string>("import_notebook", { src_path: srcPath });
}

/** Ask where to save an exported notebook. Returns the path, or null if cancelled. */
export function pickExportPath(defaultName: string): Promise<string | null> {
  return save({
    defaultPath: `${defaultName}.${NOTEBOOK_FILE_EXTENSION}`,
    filters: [{ name: "NotebookLab notebook", extensions: [NOTEBOOK_FILE_EXTENSION] }],
  });
}

/** Ask for a notebook file to import. Returns the path, or null if cancelled. */
export async function pickImportFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [{ name: "NotebookLab notebook", extensions: [NOTEBOOK_FILE_EXTENSION] }],
  });
  return typeof result === "string" ? result : (result?.[0] ?? null);
}
