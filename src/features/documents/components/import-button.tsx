/*
 * Title: import-button.tsx
 * Tech Stack: React 19, Tauri Dialog Plugin
 * Description: Button that opens the native file picker to import a document.
 *   Uses Tauri's dialog plugin for OS-native file selection instead of
 *   a manual text input.
 * Important Details: Filters to supported file types (.txt, .md, .pdf).
 *   Disabled while an import is in progress.
 */

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
        className="px-4 py-2 text-sm font-mono bg-accent-dim text-text-1
                   hover:bg-accent transition-colors disabled:opacity-50"
      >
        {importDoc.isPending ? "Importing..." : "+ Import Document"}
      </button>
      {importDoc.isError && (
        <p className="text-xs text-error mt-2">{String(importDoc.error)}</p>
      )}
    </div>
  );
}
