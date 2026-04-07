/*
 * Title: document-api.ts
 * Tech Stack: TypeScript, Tauri IPC
 * Description: Tauri invoke wrappers for document commands. Thin layer between
 *   React hooks and the Rust backend.
 * Important Details: All functions map 1:1 to Rust commands in document_commands.rs.
 *   File dialog import uses @tauri-apps/plugin-dialog for native OS file picker.
 */

import { open } from "@tauri-apps/plugin-dialog";

import { tauriInvoke } from "@/services/tauri-client";
import { SUPPORTED_FILE_TYPES } from "@/lib/constants";
import type { Document, Chunk } from "@/types/models";


export function listDocuments(notebookId: string): Promise<Document[]> {
  return tauriInvoke<Document[]>("list_documents", { notebook_id: notebookId });
}

export function getDocument(id: string): Promise<Document> {
  return tauriInvoke<Document>("get_document", { id });
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

export function getChunkCount(): Promise<number> {
  return tauriInvoke<number>("get_chunk_count");
}


/**
 * Open a native file picker dialog filtered to supported document types.
 * Returns the selected file path, or null if cancelled.
 */
export async function pickDocumentFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [
      {
        name: "Documents",
        extensions: SUPPORTED_FILE_TYPES.map((ext) => ext.replace(".", "")),
      },
    ],
  });

  if (!result) return null;
  /* open() returns string | string[] depending on multiple flag */
  return typeof result === "string" ? result : result[0] ?? null;
}
