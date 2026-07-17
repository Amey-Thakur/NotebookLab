/*
 * Name: ollama-section.tsx
 * Purpose: The Ollama area of the Models page: status, installed models, and
 *   the curated catalog.
 * Description: Adapts to what it finds. Not installed: a friendly install
 *   pointer with a re-check button. Installed but not running: says to start
 *   the app. Running: shows installed models with their disk sizes, total
 *   storage used, per-model activate and delete (two-step confirm), and the
 *   catalog browser for one-click installs. Deleting the model the active
 *   provider points at simply makes the next activation explicit; nothing
 *   crashes.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

import { useState } from "react";

import { formatBytes } from "@/lib/utils";
import { formatError } from "@/lib/format-error";

import {
  useActivateOllamaModel,
  useOllamaDeleteModel,
  useOllamaModels,
  useOllamaStatus,
} from "../hooks/use-model-management";
import { ModelCatalogBrowser } from "./model-catalog-browser";

export function OllamaSection() {
  const status = useOllamaStatus();
  const models = useOllamaModels(status.data?.running === true);
  const activate = useActivateOllamaModel();
  const deleteModel = useOllamaDeleteModel();
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const installedTags = new Set((models.data ?? []).map((m) => m.name));
  const totalBytes = (models.data ?? []).reduce((sum, m) => sum + m.size_bytes, 0);

  return (
    <div className="border border-border p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-semibold text-text-1">
          Ollama
          <span className="ml-2 text-2xs font-mono text-text-4">
            {status.data?.running
              ? `running${status.data.version ? ` · v${status.data.version}` : ""}`
              : status.data?.installed
                ? "installed, not running"
                : status.isLoading
                  ? "checking..."
                  : "not found"}
          </span>
        </h3>
        {status.data?.running && totalBytes > 0 && (
          <span className="text-2xs font-mono text-text-4">
            {formatBytes(totalBytes)} on disk
          </span>
        )}
      </div>
      <p className="text-xs text-text-3 mb-3">
        The most popular way to run open models locally. NotebookLab manages its models for you.
      </p>

      {/* Not installed: friendly install path */}
      {status.data && !status.data.installed && (
        <div className="border border-border bg-surface-2 p-3 mb-1">
          <p className="text-sm text-text-2 mb-2">
            Install Ollama once, and every model in the catalog below becomes one click away.
          </p>
          <ol className="text-xs text-text-3 space-y-1 mb-3 list-decimal pl-4">
            <li>
              Download it from{" "}
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                ollama.com/download
              </a>{" "}
              and run the installer.
            </li>
            <li>Come back here; it starts itself after install.</li>
          </ol>
          <button
            type="button"
            onClick={() => status.refetch()}
            disabled={status.isFetching}
            className="px-3 py-1.5 text-xs font-mono border border-border text-text-2
                       hover:border-accent-dim hover:text-text-1 transition-colors disabled:opacity-50"
          >
            {status.isFetching ? "Checking..." : "I installed it, check again"}
          </button>
        </div>
      )}

      {/* Installed but not running */}
      {status.data && status.data.installed && !status.data.running && (
        <div className="border border-border bg-surface-2 p-3 mb-1">
          <p className="text-sm text-text-2 mb-2">
            Ollama is installed but not running. Start the Ollama app, then check again.
          </p>
          <button
            type="button"
            onClick={() => status.refetch()}
            disabled={status.isFetching}
            className="px-3 py-1.5 text-xs font-mono border border-border text-text-2
                       hover:border-accent-dim hover:text-text-1 transition-colors disabled:opacity-50"
          >
            {status.isFetching ? "Checking..." : "Check again"}
          </button>
        </div>
      )}

      {/* Running: installed models + catalog */}
      {status.data?.running && (
        <>
          {(models.data?.length ?? 0) > 0 && (
            <div className="mb-3">
              <p className="text-2xs font-mono tracking-widest uppercase text-text-4 mb-1.5">
                Installed ({models.data?.length})
              </p>
              <div className="space-y-1">
                {models.data?.map((model) => (
                  <div
                    key={model.name}
                    className="flex flex-wrap items-center justify-between gap-2 border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-sm text-text-1 font-medium">{model.name}</span>
                      <span className="text-2xs font-mono text-text-4 ml-2">
                        {formatBytes(model.size_bytes)}
                        {model.parameter_size ? ` · ${model.parameter_size}` : ""}
                        {model.quantization ? ` · ${model.quantization}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => activate.mutate(model.name)}
                        disabled={activate.isPending}
                        className="px-2.5 py-1 text-2xs font-mono border border-border text-text-2
                                   hover:border-accent-dim hover:text-text-1 transition-colors disabled:opacity-50"
                      >
                        Use
                      </button>
                      {confirmingDelete === model.name ? (
                        <span className="flex items-center gap-1.5 text-2xs font-mono">
                          <button
                            type="button"
                            onClick={() => {
                              deleteModel.mutate(model.name);
                              setConfirmingDelete(null);
                            }}
                            className="text-error hover:underline"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingDelete(null)}
                            className="text-text-4 hover:text-text-2"
                          >
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(model.name)}
                          aria-label={`Delete model ${model.name}`}
                          className="px-2 py-1 text-2xs font-mono text-text-4 hover:text-error transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(activate.isError || deleteModel.isError) && (
            <p role="alert" className="text-xs text-error mb-2">
              {formatError(activate.error ?? deleteModel.error)}
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowCatalog(!showCatalog)}
            aria-expanded={showCatalog}
            className="px-3 py-1.5 text-xs font-mono border border-border text-text-2
                       hover:border-accent-dim hover:text-text-1 transition-colors mb-3"
          >
            {showCatalog ? "Hide the catalog" : "Browse models to install"}
          </button>

          {showCatalog && <ModelCatalogBrowser installedTags={installedTags} />}
        </>
      )}
    </div>
  );
}
