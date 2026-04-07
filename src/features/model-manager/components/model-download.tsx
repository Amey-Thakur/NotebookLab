/*
 * Title: model-download.tsx
 * Tech Stack: React 19, Tauri Events, Tailwind CSS
 * Description: Model download component with real-time progress bar. Listens to
 *   Tauri events for download progress and shows percentage, size, and status.
 * Important Details: Uses the "model-download-progress" event from the Rust backend.
 *   The download runs on a background thread so the UI stays responsive. Shows
 *   estimated download size (~2GB for the default model) to set expectations.
 */

import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useMutation } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";


interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  model_name: string;
  status: string;
}


interface ModelDownloadProps {
  onComplete: () => void;
}


export function ModelDownload({ onComplete }: ModelDownloadProps) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  const download = useMutation({
    mutationFn: () => tauriInvoke<string>("download_default_model"),
  });

  /* Listen for download progress events from the Rust backend */
  useEffect(() => {
    const unlisten = listen<DownloadProgress>("model-download-progress", (event) => {
      setProgress(event.payload);

      if (event.payload.status === "complete") {
        onComplete();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onComplete]);

  const isDownloading = progress?.status === "downloading";
  const isComplete = progress?.status === "complete";
  const isError = progress?.status.startsWith("error");

  const formatBytes = (bytes: number) => {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="border border-border bg-surface-2 p-6 mb-6">
      <h3 className="text-sm font-display font-bold text-text-1 mb-2">
        Download AI Model
      </h3>
      <p className="text-xs text-text-3 mb-4">
        NotebookLab needs a local AI model (~2 GB download). This is a one-time download
        that runs entirely on your machine.
      </p>

      {!progress && !download.isPending && (
        <button
          type="button"
          onClick={() => download.mutate()}
          disabled={download.isPending}
          className="px-4 py-2 text-sm font-mono bg-accent-dim text-text-1
                     hover:bg-accent transition-colors disabled:opacity-50"
        >
          Download Llama 3.2 3B (Q4_K_M, ~2 GB)
        </button>
      )}

      {(isDownloading || download.isPending) && progress && (
        <div>
          <div className="flex justify-between text-xs text-text-3 mb-1">
            <span>{progress.model_name}</span>
            <span>
              {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
            </span>
          </div>
          <div className="w-full h-2 bg-surface border border-border overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
          </div>
          <p className="text-xs text-text-4 mt-1">
            {progress.percent.toFixed(1)}% downloaded
          </p>
        </div>
      )}

      {isComplete && (
        <p className="text-xs text-accent font-mono">
          Download complete. Model ready to use.
        </p>
      )}

      {isError && (
        <div>
          <p className="text-xs text-error mb-2">
            {progress?.status.replace("error: ", "")}
          </p>
          <button
            type="button"
            onClick={() => {
              setProgress(null);
              download.mutate();
            }}
            className="px-3 py-1 text-xs font-mono border border-border text-text-2
                       hover:text-text-1 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {download.isPending && !progress && (
        <p className="text-xs text-text-3 font-mono">Starting download...</p>
      )}
    </div>
  );
}
