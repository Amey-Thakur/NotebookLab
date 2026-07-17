/*
 * Name: settings-page.tsx
 * Purpose: Application settings page: theme, app info, data directory, local
 *   REST API access, and keyboard shortcuts.
 * Description: Theme preference persists via localStorage. The REST API token
 *   is generated fresh each session; the copy button hands users a
 *   ready-to-run curl command. The shortcut list is read from the
 *   shared registry in lib/shortcuts.ts, the same source the shell
 *   key handler honors, so it can never drift out of sync.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { SHORTCUTS, GROUP_ORDER } from "@/lib/shortcuts";
import { KeyCaps } from "@/components/shared/key-caps";
import { useTheme } from "@/components/providers/theme-context";
import { useUserStore, MAX_NAME_LENGTH } from "@/stores/user-store";
import { useTourStore } from "@/stores/tour-store";


export function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const displayName = useUserStore((s) => s.displayName);
  const setDisplayName = useUserStore((s) => s.setDisplayName);
  const startTour = useTourStore((s) => s.start);
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

      {/* Your name */}
      <section className="mb-8">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4 pb-2 border-b border-border">
          Your name
        </h2>
        <p className="text-sm text-text-3 mb-3">
          Used to greet you on the home screen. It stays on this machine.
        </p>
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="What should we call you?"
          aria-label="Your name"
          className="w-full max-w-xs px-3 py-2 text-sm bg-surface border border-border text-text-1
                     placeholder:text-text-4 outline-none focus:border-accent-dim"
        />
      </section>

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

      {/* Documentation */}
      <section className="mb-8">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4 pb-2 border-b border-border">
          Documentation
        </h2>
        <p className="text-sm text-text-3 mb-3">
          A full guide to every feature lives inside the app, so it works offline. New here? Replay
          the quick tour that points out where everything is.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to={ROUTES.HELP}
            className="inline-block px-4 py-2 text-sm font-mono border border-border text-text-2 hover:border-accent-dim transition-colors"
          >
            Open the guide
          </Link>
          <button
            type="button"
            onClick={startTour}
            className="inline-block px-4 py-2 text-sm font-mono border border-border text-text-2 hover:border-accent-dim transition-colors"
          >
            Replay the tour
          </button>
        </div>
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

      {/* Keyboard shortcuts, read from the shared registry so this list can
          never claim a shortcut the app does not actually run. */}
      <section>
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4 pb-2 border-b border-border">
          Keyboard Shortcuts
        </h2>
        <p className="text-xs text-text-4 mb-4">
          Press{" "}
          <kbd className="font-mono text-xs text-text-2 bg-surface-2 border border-border px-1.5 py-0.5">?</kbd>{" "}
          anywhere to bring these up.
        </p>
        <div className="space-y-5">
          {GROUP_ORDER.map((group) => {
            const rows = SHORTCUTS.filter((s) => s.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group}>
                <h3 className="text-2xs font-mono uppercase tracking-widest text-text-4 mb-2">{group}</h3>
                <div className="space-y-1">
                  {rows.map((shortcut) => (
                    <div key={shortcut.id} className="flex items-center justify-between gap-4 text-sm py-1">
                      <span className="text-text-2">{shortcut.description}</span>
                      <KeyCaps keys={shortcut.keys} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Developer logs: folded away, read-only, honest about scope */}
      <section className="mb-8">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3 pb-2 border-b border-border">
          Advanced
        </h2>
        <DeveloperLogs />
      </section>
    </div>
  );
}

/* The backend's recent log lines, for the curious and for bug reports. Held in
   memory only (last 500 lines), fetched on open and on Refresh. */
function DeveloperLogs() {
  const [open, setOpen] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  const { data: logs, refetch, isFetching } = useQuery({
    queryKey: [QUERY_KEYS.LOGS],
    queryFn: () => tauriInvoke<string[]>("get_recent_logs"),
    enabled: open,
  });

  const copyLogs = () => {
    if (!logs?.length) return;
    navigator.clipboard.writeText(logs.join("\n")).then(
      () => {
        setCopiedLogs(true);
        setTimeout(() => setCopiedLogs(false), 1500);
      },
      () => setCopiedLogs(false),
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="px-3 py-1.5 text-xs font-mono border border-border text-text-3
                   hover:border-accent-dim hover:text-text-1 transition-colors"
      >
        {open ? "Hide developer logs" : "Show developer logs"}
      </button>
      <p className="text-2xs text-text-4 mt-2 max-w-prose">
        What the backend has been doing this session: model detection, imports, downloads, and
        errors. Kept in memory only (last 500 lines), never written to disk. Useful when reporting
        a bug or building against the local API.
      </p>

      {open && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="px-2.5 py-1 text-2xs font-mono border border-border text-text-3
                         hover:border-accent-dim hover:text-text-1 transition-colors disabled:opacity-50"
            >
              {isFetching ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={copyLogs}
              disabled={!logs?.length}
              className="px-2.5 py-1 text-2xs font-mono border border-border text-text-3
                         hover:border-accent-dim hover:text-text-1 transition-colors disabled:opacity-50"
            >
              {copiedLogs ? "Copied" : "Copy all"}
            </button>
            <span className="text-2xs font-mono text-text-4">{logs?.length ?? 0} lines</span>
          </div>
          <pre
            className="max-h-[320px] overflow-auto border border-border bg-surface-2 p-3
                       text-2xs font-mono text-text-3 leading-relaxed whitespace-pre-wrap"
            aria-label="Recent backend log lines"
          >
            {logs?.length ? logs.join("\n") : "No log lines yet this session."}
          </pre>
        </div>
      )}
    </div>
  );
}
