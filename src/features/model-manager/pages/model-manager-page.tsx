/*
 * Name: model-manager-page.tsx
 * Purpose: Model manager page with zero-config setup guide.
 * Description: Shows a 3-step setup guide when no providers are registered,
 *   one-click model download, and the bundled local server
 *   controls. Preset buttons cover common local providers (Ollama,
 *   LM Studio, llama.cpp). Auto-detection runs on app startup; the
 *   setup guide's "Check for providers" re-runs the same probe on
 *   demand via detect_providers rather than just refreshing the
 *   cached list.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import type { ProviderInfo } from "@/types/models";
import { SetupGuide } from "../components/setup-guide";
import { ModelDownload } from "../components/model-download";
import { LocalServerCard } from "../components/local-server-card";


const PRESETS = [
  { name: "Ollama", base_url: "http://127.0.0.1:11434", model: "llama3.2:3b", is_local: true },
  { name: "LM Studio", base_url: "http://127.0.0.1:1234", model: "local-model", is_local: true },
  { name: "llama.cpp", base_url: "http://127.0.0.1:8080", model: "local-model", is_local: true },
] as const;


export function ModelManagerPage() {
  const queryClient = useQueryClient();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [isLocal, setIsLocal] = useState(true);

  const { data: providers } = useQuery({
    queryKey: [QUERY_KEYS.PROVIDERS],
    queryFn: () => tauriInvoke<ProviderInfo[]>("list_providers"),
  });

  const { data: activeName } = useQuery({
    queryKey: [QUERY_KEYS.ACTIVE_PROVIDER],
    queryFn: () => tauriInvoke<string | null>("get_active_provider_name"),
  });

  const { data: hasLocalModel, refetch: refetchModel } = useQuery({
    queryKey: [QUERY_KEYS.PROVIDERS, "has-local-model"],
    queryFn: () => tauriInvoke<boolean>("has_local_model"),
  });

  const register = useMutation({
    mutationFn: (input: { name: string; base_url: string; api_key: string | null; model: string; is_local: boolean }) =>
      tauriInvoke<number>("register_provider", { input }),
    onSuccess: (index) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROVIDERS] });
      setActive.mutate(index);
    },
  });

  const setActive = useMutation({
    mutationFn: (index: number) =>
      tauriInvoke<void>("set_active_provider", { index }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROVIDERS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ACTIVE_PROVIDER] });
    },
  });

  const hasProviders = (providers?.length ?? 0) > 0;
  const providerNames = new Set(providers?.map((p) => p.name) ?? []);

  const handlePreset = (preset: typeof PRESETS[number]) => {
    register.mutate({
      name: preset.name,
      base_url: preset.base_url,
      api_key: null,
      model: preset.model,
      is_local: preset.is_local,
    });
  };

  const handleAdvancedRegister = () => {
    register.mutate({
      name, base_url: baseUrl, api_key: apiKey || null, model, is_local: isLocal,
    }, {
      onSuccess: () => { setShowAdvanced(false); setName(""); setBaseUrl(""); setApiKey(""); setModel(""); },
    });
  };

  const refreshProviders = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROVIDERS] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ACTIVE_PROVIDER] });
  };

  /* Actually re-probe local endpoints instead of only refreshing the cache */
  const detect = useMutation({
    mutationFn: () => tauriInvoke<ProviderInfo[]>("detect_providers"),
    onSuccess: () => refreshProviders(),
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-display font-bold text-text-1 mb-2">Models</h1>
      <p className="text-sm text-text-3 mb-6">
        Active: <span className="text-accent font-mono">{activeName || "None"}</span>
      </p>

      {/* Setup guide shown when no providers */}
      {!hasProviders && (
        <SetupGuide onDetect={() => detect.mutate()} isDetecting={detect.isPending} />
      )}

      {/* Model download shown when no local model is available */}
      {!hasLocalModel && (
        <ModelDownload onComplete={() => {
          refetchModel();
          refreshProviders();
          queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SIDECAR] });
        }} />
      )}

      {/* Bundled llama-server controls, once a model exists */}
      <LocalServerCard />

      {/* Quick preset buttons */}
      <div className="mb-6">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3 pb-2 border-b border-border">
          Quick Setup
        </h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => handlePreset(preset)}
              disabled={register.isPending || providerNames.has(preset.name)}
              className="px-4 py-2 text-sm font-mono border border-border text-text-2
                         hover:border-accent-dim hover:text-text-1 transition-colors disabled:opacity-50"
            >
              {providerNames.has(preset.name) ? "✓" : "+"} {preset.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="px-4 py-2 text-sm font-mono text-text-4 border border-border
                       hover:border-accent-dim hover:text-text-1 transition-colors"
          >
            Custom...
          </button>
        </div>
        {register.isError && (
          <p role="alert" className="text-xs text-error mt-2">{formatError(register.error)}</p>
        )}
        {detect.isError && (
          <p role="alert" className="text-xs text-error mt-2">{formatError(detect.error)}</p>
        )}
      </div>

      {/* Advanced registration form */}
      {showAdvanced && (
        <div className="p-4 border border-border bg-surface-2 mb-6">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label htmlFor="provider-name" className="block text-xs font-mono text-text-4 mb-1">Name</label>
              <input id="provider-name" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                           outline-none focus:border-accent-dim" />
            </div>
            <div>
              <label htmlFor="provider-model" className="block text-xs font-mono text-text-4 mb-1">Model</label>
              <input id="provider-model" value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                           outline-none focus:border-accent-dim" />
            </div>
            <div>
              <label htmlFor="provider-base-url" className="block text-xs font-mono text-text-4 mb-1">Base URL</label>
              <input id="provider-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                           outline-none focus:border-accent-dim" />
            </div>
            <div>
              <label htmlFor="provider-api-key" className="block text-xs font-mono text-text-4 mb-1">API Key (optional)</label>
              <input id="provider-api-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                           outline-none focus:border-accent-dim"
                placeholder="Leave empty for local" />
            </div>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm text-text-2">
              <input type="checkbox" checked={isLocal} onChange={(e) => setIsLocal(e.target.checked)} />
              Local provider
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleAdvancedRegister}
              disabled={register.isPending || !name || !baseUrl || !model}
              className="px-3 py-1 text-xs font-mono bg-primary text-on-primary disabled:opacity-50">
              Register
            </button>
            <button type="button" onClick={() => setShowAdvanced(false)}
              className="px-3 py-1 text-xs font-mono text-text-3 border border-border">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Provider list */}
      {hasProviders && (
        <>
          <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3 pb-2 border-b border-border">
            Registered Providers ({providers?.length})
          </h2>
          {providers?.map((p) => (
            <div key={p.index} className={`flex items-center justify-between p-3 border mb-1 ${p.is_active ? "border-accent-dim bg-surface-2" : "border-border"}`}>
              <div>
                <span className="text-sm text-text-1 font-medium">{p.name}</span>
                <span className="text-xs font-mono text-text-4 ml-2">{p.is_local ? "local" : "cloud"}</span>
              </div>
              <div className="flex items-center gap-2">
                {p.is_active ? (
                  <span className="text-xs font-mono text-accent">Active</span>
                ) : (
                  <button type="button" onClick={() => setActive.mutate(p.index)}
                    className="text-xs font-mono text-text-3 hover:text-text-1">
                    Activate
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
