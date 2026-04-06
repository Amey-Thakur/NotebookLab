/*
 * Title: settings-page.tsx
 * Tech Stack: React 19, Tailwind CSS
 * Description: Application settings page. Theme switching, app info, and data directory.
 * Important Details: Theme preference persists via localStorage. Data directory is
 *   fetched from the Tauri backend. Settings will expand as features are added.
 */

import { useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { useTheme } from "@/components/providers/theme-provider";


export function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const { data: version } = useQuery({
    queryKey: [QUERY_KEYS.SETTINGS, "version"],
    queryFn: () => tauriInvoke<string>("get_app_version"),
  });

  const { data: dataDir } = useQuery({
    queryKey: [QUERY_KEYS.SETTINGS, "data-dir"],
    queryFn: () => tauriInvoke<string>("get_data_directory"),
  });

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-text-1 mb-8">Settings</h1>

      {/* Appearance */}
      <section className="mb-8">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4">
          Appearance
        </h2>
        <div className="flex gap-2">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              type="button"
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
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4">
          About
        </h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-3">Version</span>
            <span className="font-mono text-text-1">{version || "..."}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-3">Data Directory</span>
            <span className="font-mono text-text-4 text-xs max-w-[300px] truncate">
              {dataDir || "..."}
            </span>
          </div>
        </div>
      </section>

      {/* Keyboard shortcuts */}
      <section>
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4">
          Keyboard Shortcuts
        </h2>
        <div className="space-y-1">
          {[
            ["Ctrl+K", "Open search"],
            ["Ctrl+S", "Save note (auto-saves every 2s)"],
            ["Ctrl+N", "New note"],
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
