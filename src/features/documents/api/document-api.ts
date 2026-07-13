/*
 * Name: document-api.ts
 * Purpose: Tauri invoke wrappers for document commands.
 * Description: Thin layer between React hooks and the Rust backend. All
 *   functions map 1:1 to Rust commands in document_commands.rs.
 *   File dialog import uses @tauri-apps/plugin-dialog for native
 *   OS file picker.
 * Tech Stack: TypeScript, Tauri IPC
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { open } from "@tauri-apps/plugin-dialog";

import { tauriInvoke } from "@/services/tauri-client";
import { SUPPORTED_FILE_TYPES, OCR_IMAGE_TYPES } from "@/lib/constants";
import type { Document as AppDocument, Chunk } from "@/types/models";


export function listDocuments(notebookId: string): Promise<AppDocument[]> {
  return tauriInvoke<AppDocument[]>("list_documents", { notebook_id: notebookId });
}

export function importDocument(notebookId: string, filePath: string): Promise<string> {
  return tauriInvoke<string>("import_document", { notebook_id: notebookId, file_path: filePath });
}

export function deleteDocument(id: string): Promise<void> {
  return tauriInvoke<void>("delete_document", { id });
}

export function getDocumentChunks(documentId: string): Promise<Chunk[]> {
  return tauriInvoke<Chunk[]>("get_document_chunks", { document_id: documentId });
}

/**
 * Open a native file picker dialog filtered to supported types. Documents and
 * images are offered as separate groups, with an "All supported" group first so
 * everything shows by default. Returns the selected file path, or null if
 * cancelled.
 */
export async function pickDocumentFile(): Promise<string | null> {
  const strip = (ext: string) => ext.replace(".", "");
  const imageSet = new Set<string>(OCR_IMAGE_TYPES);
  const documentExtensions = SUPPORTED_FILE_TYPES.filter((ext) => !imageSet.has(ext)).map(strip);
  const imageExtensions = OCR_IMAGE_TYPES.map(strip);

  const result = await open({
    multiple: false,
    filters: [
      { name: "All supported", extensions: SUPPORTED_FILE_TYPES.map(strip) },
      { name: "Documents", extensions: documentExtensions },
      { name: "Images", extensions: imageExtensions },
    ],
  });

  if (!result) return null;
  /* open() returns string | string[] depending on multiple flag */
  return typeof result === "string" ? result : result[0] ?? null;
}
