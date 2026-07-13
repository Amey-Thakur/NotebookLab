/*
 * Name: import-button.tsx
 * Purpose: Button that opens the native file picker to import a document.
 * Description: Uses Tauri's dialog plugin for OS-native file selection
 *   instead of a manual text input. Filters to supported file
 *   types: text, Markdown, PDF, Word (.docx), and images read with
 *   OCR. Disabled while an import is in progress.
 * Tech Stack: React 19, Tauri Dialog Plugin
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { formatError } from "@/lib/format-error";
import { pickDocumentFile } from "../api/document-api";
import { useImportDocument } from "../hooks/use-documents";


interface ImportButtonProps {
  notebookId: string;
}


export function ImportButton({ notebookId }: ImportButtonProps) {
  const importDoc = useImportDocument(notebookId);

  const handleClick = async () => {
    const filePath = await pickDocumentFile();
    if (filePath) {
      importDoc.mutate(filePath);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={importDoc.isPending}
        className="px-4 py-2 text-sm font-mono bg-primary text-on-primary
                   hover:bg-primary-hover transition-colors disabled:opacity-50"
      >
        {importDoc.isPending ? "Importing..." : "+ Import Document"}
      </button>
      {importDoc.isError && (
        <p role="alert" className="text-xs text-error mt-2">{formatError(importDoc.error)}</p>
      )}
    </div>
  );
}
