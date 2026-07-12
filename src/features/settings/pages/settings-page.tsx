/*
 * Name: settings-page.tsx
 * Purpose: Application settings page: theme, app info, data directory, local
 *   REST API access, and keyboard shortcuts.
 * Description: Theme preference persists via localStorage. The REST API token
 *   is generated fresh each session; the copy button hands users a
 *   ready-to-run curl command. Every shortcut listed here is
 *   implemented (Ctrl+K and Ctrl+N in AppShell, Ctrl+S in the
 *   editor page).
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { useTheme } from "@/components/providers/theme-context";


export function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [copied, setCopied] = useState(false);

  const { data: version } = useQuery({
    queryKey: [QUERY_KEYS.SETTINGS, "version"],
    queryFn: () => tauriInvoke<string>("get_app_version"),
  });

  const { data: dataDir } = useQuery({
    queryKey: [QUERY_KEYS.SETTINGS, "data-dir"],
    queryFn: () => tauriInvoke<string>("get_data_directory"),
  });

  const { data: apiToken } = useQuery({
    queryKey: [QUERY_KEYS.SETTINGS, "api-token"],
    queryFn: () => tauriInvoke<string>("get_api_token"),
    staleTime: Infinity,
  });

  const copyApiExample = () => {
    if (!apiToken) return;
    const example = `curl -H "Authorization: Bearer ${apiToken}" http://127.0.0.1:8484/api/notebooks`;
    navigator.clipboard.writeText(example).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false),
    );
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-text-1 mb-8">Settings</h1>

      {/* Appearance */}
      <section className="mb-8">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4 pb-2 border-b border-border">
          Appearance
        </h2>
        <div className="flex gap-2" role="group" aria-label="Theme">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={theme === t}
              onClick={() => setTheme(t)}
              className={`px-4 py-2 text-sm font-mono border transition-colors ${
                theme === t
                  ? "border-accent-dim text-text-1 bg-surface-2"
                  : "border-border text-text-3 hover:text-text-1"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-4 mt-2">
          Current: {resolvedTheme}
        </p>
      </section>

      {/* About */}
      <section className="mb-8">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4 pb-2 border-b border-border">
          About
        </h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-3">Version</span>
            <span className="font-mono text-text-1">{version || "..."}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-3">Data Directory</span>
            <span className="font-mono text-text-4 text-xs max-w-[300px] truncate" title={dataDir}>
              {dataDir || "..."}
            </span>
          </div>
        </div>
      </section>

      {/* Local REST API */}
      <section className="mb-8">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4 pb-2 border-b border-border">
          Local REST API
        </h2>
        <p className="text-sm text-text-3 mb-3">
          Scripts on this machine can read your notebooks at{" "}
          <code className="font-mono text-xs text-text-2">http://127.0.0.1:8484</code>.
          Requests need this session token, which changes on every launch.
        </p>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 px-3 py-2 text-xs font-mono text-text-2 bg-surface-2 border border-border truncate"
            title={apiToken}
          >
            {apiToken || "..."}
          </code>
          <button
            type="button"
            onClick={copyApiExample}
            disabled={!apiToken}
            className="px-3 py-2 text-xs font-mono border border-border text-text-3
                       hover:text-text-1 hover:border-accent-dim transition-colors disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy curl"}
          </button>
        </div>
      </section>

      {/* Keyboard shortcuts */}
      <section>
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4 pb-2 border-b border-border">
          Keyboard Shortcuts
        </h2>
        <div className="space-y-1">
          {[
            ["Ctrl+K", "Open the command palette"],
            ["Ctrl+N", "New note in the active notebook"],
            ["Ctrl+S", "Save the open note now (also auto-saves every 2s)"],
          ].map(([key, desc]) => (
            <div key={key} className="flex justify-between text-sm py-1">
              <span className="text-text-3">{desc}</span>
              <kbd className="font-mono text-xs text-text-4 bg-surface-2 px-2 py-0.5 border border-border">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
