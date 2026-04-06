/*
 * Title: model-manager-page.tsx
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * Description: Model manager page. Register LLM providers (local or cloud),
 *   switch the active provider, and view available models from the registry.
 * Important Details: Supports llama.cpp (local), Ollama (local), and OpenAI-compatible
 *   cloud providers. The active provider is used by chat, thinking partner, and transforms.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";


interface ProviderInfo {
  index: number;
  name: string;
  is_local: boolean;
  is_available: boolean;
  is_active: boolean;
}


export function ModelManagerPage() {
  const queryClient = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [name, setName] = useState("Ollama");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:11434");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("llama3.2:3b");
  const [isLocal, setIsLocal] = useState(true);

  const { data: providers } = useQuery({
    queryKey: ["providers"],
    queryFn: () => tauriInvoke<ProviderInfo[]>("list_providers"),
  });

  const { data: activeName } = useQuery({
    queryKey: ["active-provider"],
    queryFn: () => tauriInvoke<string | null>("get_active_provider_name"),
  });

  const register = useMutation({
    mutationFn: () =>
      tauriInvoke<number>("register_provider", {
        input: { name, base_url: baseUrl, api_key: apiKey || null, model, is_local: isLocal },
      }),
    onSuccess: (index) => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      setActive.mutate(index);
      setShowRegister(false);
    },
  });

  const setActive = useMutation({
    mutationFn: (index: number) =>
      tauriInvoke<void>("set_active_provider", { index }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
      queryClient.invalidateQueries({ queryKey: ["active-provider"] });
    },
  });

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-text-1 mb-2">Models</h1>
      <p className="text-sm text-text-3 mb-8">
        Active: <span className="text-accent font-mono">{activeName || "None"}</span>
      </p>

      <button
        type="button"
        onClick={() => setShowRegister(!showRegister)}
        className="px-4 py-2 text-sm font-mono bg-accent-dim text-text-1 mb-6"
      >
        + Add Provider
      </button>

      {showRegister && (
        <div className="p-4 border border-border bg-surface-2 mb-6">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-mono text-text-4 mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-4 mb-1">Model</label>
              <input value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-4 mb-1">Base URL</label>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-4 mb-1">API Key (optional)</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1 outline-none"
                placeholder="Leave empty for local" />
            </div>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm text-text-2">
              <input type="checkbox" checked={isLocal} onChange={(e) => setIsLocal(e.target.checked)} />
              Local provider (no internet needed)
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => register.mutate()}
              disabled={register.isPending}
              className="px-3 py-1 text-xs font-mono bg-accent-dim text-text-1 disabled:opacity-50">
              Register &amp; Activate
            </button>
            <button type="button" onClick={() => setShowRegister(false)}
              className="px-3 py-1 text-xs font-mono text-text-3 border border-border">
              Cancel
            </button>
          </div>
          {register.isError && (
            <p className="text-xs text-error mt-2">{String(register.error)}</p>
          )}
        </div>
      )}

      {/* Provider list */}
      <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3">
        Registered Providers ({providers?.length || 0})
      </h2>
      {providers?.length === 0 && (
        <p className="text-sm text-text-4">No providers registered. Add one to enable AI features.</p>
      )}
      {providers?.map((p) => (
        <div key={p.index} className={`flex items-center justify-between p-3 border mb-1 ${p.is_active ? "border-accent-dim bg-surface-2" : "border-border"}`}>
          <div>
            <span className="text-sm text-text-1 font-medium">{p.name}</span>
            <span className="text-xs font-mono text-text-4 ml-2">
              {p.is_local ? "local" : "cloud"}
            </span>
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
    </div>
  );
}
