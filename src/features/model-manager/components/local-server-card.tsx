/*
 * Name: local-server-card.tsx
 * Purpose: Controls for the bundled llama-server.
 * Description: Start and stop the local AI server, see its state, and pick
 *   from downloaded GGUF models. This card closes the loop after a
 *   model download: without it the downloaded model could never
 *   power chat. Status polls faster while the server is starting
 *   (model load takes seconds to minutes). When the server reports
 *   ready the backend auto-activates it as the provider, so the
 *   provider queries are invalidated here.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import type { ModelFileInfo, SidecarStatus } from "@/types/models";


const STATE_LABELS: Record<SidecarStatus["state"], string> = {
  stopped: "Stopped",
  starting: "Starting (loading model)...",
  ready: "Running",
  crashed: "Stopped unexpectedly",
  stopping: "Stopping...",
};


export function LocalServerCard() {
  const queryClient = useQueryClient();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const { data: available } = useQuery({
    queryKey: [QUERY_KEYS.SIDECAR, "available"],
    queryFn: () => tauriInvoke<boolean>("sidecar_available"),
    staleTime: Infinity,
  });

  const { data: status } = useQuery({
    queryKey: [QUERY_KEYS.SIDECAR, "status"],
    queryFn: () => tauriInvoke<SidecarStatus>("get_sidecar_status"),
    refetchInterval: (query) =>
      query.state.data?.state === "starting" ? 2000 : 10000,
    enabled: available === true,
  });

  const { data: models } = useQuery({
    queryKey: [QUERY_KEYS.SIDECAR, "models"],
    queryFn: () => tauriInvoke<ModelFileInfo[]>("list_local_models"),
    enabled: available === true,
  });

  const start = useMutation({
    mutationFn: (modelPath: string | null) =>
      tauriInvoke<SidecarStatus>("start_sidecar", { model_path: modelPath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SIDECAR, "status"] });
    },
  });

  const stop = useMutation({
    mutationFn: () => tauriInvoke<void>("stop_sidecar"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SIDECAR, "status"] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROVIDERS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ACTIVE_PROVIDER] });
    },
  });

  /* When the server becomes ready the backend registers and activates it as
     a provider; reflect that in the providers list without a manual refresh. */
  const state = status?.state ?? "stopped";
  useEffect(() => {
    if (state === "ready") {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROVIDERS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ACTIVE_PROVIDER] });
    }
  }, [state, queryClient]);

  /* Hide the card entirely when the sidecar binary is not bundled (dev builds
     without the download step) or no model exists yet. */
  if (available !== true || !models || models.length === 0) {
    return null;
  }

  const isRunning = state === "ready" || state === "starting";
  const dotColor =
    state === "ready" ? "bg-mark"
    : state === "starting" ? "bg-amber-600"
    : state === "crashed" ? "bg-error"
    : "bg-text-4";

  return (
    <div className="border border-border bg-surface-2 p-6 mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-display font-bold text-text-1">Local AI Server</h2>
        <span className="flex items-center gap-2 text-xs font-mono text-text-3">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
          {STATE_LABELS[state]}
        </span>
      </div>

      <p className="text-xs text-text-3 mb-4">
        Runs the downloaded model on this machine with llama.cpp. Nothing leaves
        your computer. Starting loads the model into memory, which can take a
        minute on the first run.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        {!isRunning ? (
          <>
            <button
              type="button"
              onClick={() => start.mutate(selectedPath)}
              disabled={start.isPending}
              className="px-4 py-2 text-sm font-mono bg-primary text-on-primary
                         hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {state === "crashed" ? "Restart Server" : "Start Server"}
            </button>
            {models.length > 1 ? (
              <label className="flex items-center gap-2 text-xs font-mono text-text-4">
                with
                <select
                  value={selectedPath ?? models[0].path}
                  onChange={(e) => setSelectedPath(e.target.value)}
                  aria-label="Model to start the server with"
                  className="px-2 py-1.5 text-xs font-mono bg-surface border border-border
                             text-text-1 outline-none focus:border-accent-dim max-w-[280px]"
                >
                  {models.map((m) => (
                    <option key={m.path} value={m.path}>
                      {m.name} ({m.size_display})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="text-xs font-mono text-text-4">
                {models[0].name} ({models[0].size_display})
              </span>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => stop.mutate()}
              disabled={stop.isPending || state === "starting"}
              className="px-4 py-2 text-sm font-mono border border-border text-text-2
                         hover:border-error hover:text-error transition-colors disabled:opacity-50"
            >
              Stop Server
            </button>
            <span className="text-xs font-mono text-text-4">
              {status?.model_path
                ? (models.find((m) => m.path === status.model_path)?.name ?? models[0].name)
                : models[0].name}
            </span>
          </>
        )}
      </div>

      {state === "crashed" && (
        <p role="alert" className="text-xs text-error">
          The server stopped unexpectedly. Restart it, or check that your machine
          has enough free memory for the model.
        </p>
      )}
      {(start.isError || stop.isError) && (
        <p role="alert" className="text-xs text-error">
          {formatError(start.error ?? stop.error)}
        </p>
      )}
    </div>
  );
}
