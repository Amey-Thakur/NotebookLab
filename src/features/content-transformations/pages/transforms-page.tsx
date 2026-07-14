/*
 * Name: transforms-page.tsx
 * Purpose: Content transformations page.
 * Description: Apply AI-powered transformations (summarize, extract key
 *   points, custom prompts) to imported documents. Requires an
 *   active notebook with processed documents. Results are
 *   displayed inline and can be copied.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { ModelRequiredNotice } from "@/components/shared/model-required-notice";
import { ROUTES } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import { usePersistentDraft } from "@/lib/use-persistent-draft";
import { useNotebookStore } from "@/stores/notebook-store";
import { useDocuments } from "@/features/documents/hooks/use-documents";


type TransformType = "summarize" | "extractkeypoints" | "custom";

const TRANSFORM_LABELS: Record<TransformType, string> = {
  summarize: "Summarize",
  extractkeypoints: "Extract Key Points",
  custom: "Custom Prompt",
};


export function TransformsPage() {
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const [selectedDoc, setSelectedDoc] = useState<string>("");
  const [transformType, setTransformType] = useState<TransformType>("summarize");
  /* Preserve the typed custom instruction across navigation and reload. */
  const [customPrompt, setCustomPrompt] = usePersistentDraft("notebooklab-draft-transform-custom");
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: documents } = useDocuments(activeNotebookId ?? undefined);

  const processedDocs = documents?.filter((d) => d.status === "processed") || [];

  const transform = useMutation({
    mutationFn: () =>
      tauriInvoke<string>("transform_document", {
        document_id: selectedDoc,
        transform_type: transformType,
        custom_prompt: transformType === "custom" ? customPrompt : null,
      }),
    onSuccess: (data) => setResult(data),
  });

  if (!activeNotebookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-3 p-8">
        <p className="text-lg mb-2">No notebook selected</p>
        <p className="text-sm text-text-4 mb-4">Open a notebook first to transform documents.</p>
        <Link
          to={ROUTES.NOTEBOOKS}
          className="px-4 py-2 text-sm font-mono border border-border text-text-2 hover:border-accent-dim transition-colors"
        >
          Go to Notebooks
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4">
        <h1 className="text-2xl font-display font-bold text-text-1 mb-4">Content Transforms</h1>

        <ModelRequiredNotice action="Transforms" />

        {/* Document selector */}
        <div className="mb-4">
          <label htmlFor="transform-document" className="block text-xs font-mono text-text-4 mb-1">
            Document
          </label>
          <select
            id="transform-document"
            value={selectedDoc}
            onChange={(e) => { setSelectedDoc(e.target.value); setResult(null); }}
            className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                       outline-none focus:border-accent-dim"
          >
            <option value="">Select a document...</option>
            {processedDocs.map((doc) => (
              <option key={doc.id} value={doc.id}>{doc.title} (.{doc.file_type})</option>
            ))}
          </select>
        </div>

        {/* Transform type */}
        <div className="flex gap-1 mb-4" role="group" aria-label="Transformation type">
          {(Object.entries(TRANSFORM_LABELS) as [TransformType, string][]).map(([type, label]) => (
            <button
              key={type}
              type="button"
              aria-pressed={transformType === type}
              onClick={() => { setTransformType(type); setResult(null); }}
              className={`px-4 py-2 text-sm font-mono border transition-colors ${
                transformType === type
                  ? "border-accent-dim text-text-1 bg-surface-2"
                  : "border-border text-text-3 hover:text-text-1"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Custom prompt input */}
        {transformType === "custom" && (
          <div className="mb-4">
            <label htmlFor="transform-custom-prompt" className="block text-xs font-mono text-text-4 mb-1">
              Custom instruction
            </label>
            <input
              id="transform-custom-prompt"
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g., Extract all statistics and data points..."
              className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                         placeholder:text-text-4 outline-none focus:border-accent-dim"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => transform.mutate()}
          disabled={!selectedDoc || transform.isPending || (transformType === "custom" && !customPrompt.trim())}
          className="px-4 py-2 text-sm font-mono bg-primary text-on-primary disabled:opacity-50"
        >
          {transform.isPending ? "Processing..." : "Transform"}
        </button>
      </div>

      {/* Result */}
      <div className="flex-1 overflow-auto px-8 py-4">
        {transform.isError && (
          <div role="alert" className="p-3 border border-error text-xs text-error">
            {formatError(transform.error)}
          </div>
        )}

        {result && (
          <div className="p-6 border border-border bg-surface">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-mono tracking-widest uppercase text-text-4">
                {TRANSFORM_LABELS[transformType]} Result
              </h2>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(result).then(
                    () => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    },
                    () => setCopied(false),
                  );
                }}
                className="text-xs font-mono text-text-3 hover:text-text-1"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="text-sm font-body text-text-2 whitespace-pre-wrap leading-relaxed">
              {result}
            </pre>
          </div>
        )}

        {!result && !transform.isPending && (
          <div className="flex items-center justify-center h-full text-text-4">
            <p className="text-sm">Select a document and choose a transformation.</p>
          </div>
        )}
      </div>
    </div>
  );
}
