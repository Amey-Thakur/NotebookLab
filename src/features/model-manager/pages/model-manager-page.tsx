/*
 * Name: model-manager-page.tsx
 * Purpose: The unified Model Manager: local models, cloud providers, and
 *   everything between.
 * Description: One place for all of it, organised by where the model runs.
 *   The top states the active model and what this computer can handle (RAM,
 *   CPU, GPU), which drives the catalog's fit badges. "On this computer"
 *   holds the bundled zero-setup server and the Ollama area with its curated
 *   one-click catalog. "Cloud providers" holds the guided connections for
 *   Anthropic, OpenAI, Gemini, and DeepSeek. Advanced (a custom
 *   OpenAI-compatible endpoint, the full provider registry) stays folded away
 *   so the default view never overwhelms. A first-visit banner points new
 *   users at the three paths instead of a wall of options.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import type { ProviderInfo } from "@/types/models";

import { ModelDownload } from "../components/model-download";
import { LocalServerCard } from "../components/local-server-card";
import { OllamaSection } from "../components/ollama-section";
import { CloudProvidersSection } from "../components/cloud-providers-section";
import {
  useActiveProviderName,
  useHardwareProfile,
  useProviders,
  useRegisterProvider,
  useSetActiveProvider,
} from "../hooks/use-model-management";

export function ModelManagerPage() {
  const queryClient = useQueryClient();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [isLocal, setIsLocal] = useState(true);

  const { data: providers } = useProviders();
  const { data: activeName } = useActiveProviderName();
  const hardware = useHardwareProfile();

  const { data: hasLocalModel, refetch: refetchModel } = useQuery({
    queryKey: [QUERY_KEYS.PROVIDERS, "has-local-model"],
    queryFn: () => tauriInvoke<boolean>("has_local_model"),
  });

  const register = useRegisterProvider();
  const setActive = useSetActiveProvider();

  const refreshProviders = () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROVIDERS] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ACTIVE_PROVIDER] });
  };

  /* Actually re-probe local endpoints instead of only refreshing the cache */
  const detect = useMutation({
    mutationFn: () => tauriInvoke<ProviderInfo[]>("detect_providers"),
    onSuccess: refreshProviders,
  });

  const activeProvider = providers?.find((p) => p.is_active);
  const hasProviders = (providers?.length ?? 0) > 0;

  const handleAdvancedRegister = () => {
    register.mutate(
      { name, kind: "custom", base_url: baseUrl, api_key: apiKey || null, model, is_local: isLocal },
      {
        onSuccess: (index) => {
          setActive.mutate(index);
          setShowAdvanced(false);
          setName("");
          setBaseUrl("");
          setApiKey("");
          setModel("");
        },
      },
    );
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-text-1 mb-2">Models</h1>

      {/* Active model, plainly */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <p className="text-sm text-text-3">
          Active:{" "}
          <span className="text-accent font-mono">
            {activeName || "None yet"}
          </span>
          {activeProvider?.model ? (
            <span className="text-text-4 font-mono"> · {activeProvider.model}</span>
          ) : null}
        </p>
        {activeProvider && (
          <span className="text-2xs font-mono text-text-4">
            {activeProvider.is_local ? "runs on this computer" : "cloud"}
          </span>
        )}
      </div>

      {/* What this computer can handle, driving the catalog's fit badges */}
      <p className="text-2xs font-mono text-text-4 mb-6">
        {hardware.data
          ? `This computer: ${hardware.data.total_ram_gb.toFixed(0)} GB RAM · ${hardware.data.cpu_cores} cores` +
            (hardware.data.gpu_name
              ? ` · ${hardware.data.gpu_name}${
                  hardware.data.gpu_vram_gb
                    ? ` (${hardware.data.gpu_vram_gb.toFixed(0)} GB VRAM)`
                    : ""
                }`
              : "")
          : hardware.isLoading
            ? "Checking what this computer can run..."
            : ""}
      </p>

      {/* First visit: the three paths, so "what should I do next?" answers itself */}
      {!hasProviders && (
        <div className="border border-accent-dim bg-surface-2 p-4 mb-6">
          <h2 className="text-base font-display font-bold text-text-1 mb-1">
            Pick how you want to run AI
          </h2>
          <p className="text-sm text-text-3 mb-3 max-w-prose">
            Everything in NotebookLab works with any of the three. You can mix them and switch
            anytime from the model menu in the top bar.
          </p>
          <ul className="text-xs text-text-3 space-y-1.5 list-disc pl-4 max-w-prose">
            <li>
              <span className="text-text-1 font-semibold">Easiest, fully offline:</span> download
              the bundled starter model below; nothing else to install.
            </li>
            <li>
              <span className="text-text-1 font-semibold">More choice, still local:</span> install
              Ollama and pick from the catalog; we handle the rest.
            </li>
            <li>
              <span className="text-text-1 font-semibold">Most capable:</span> connect a cloud
              provider with your own API key.
            </li>
          </ul>
        </div>
      )}

      {/* ---- On this computer ---- */}
      <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3 pb-2 border-b border-border">
        On this computer
      </h2>

      {!hasLocalModel && (
        <ModelDownload
          onComplete={() => {
            refetchModel();
            refreshProviders();
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SIDECAR] });
          }}
        />
      )}

      <LocalServerCard />

      <OllamaSection />

      {/* ---- Cloud providers ---- */}
      <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3 pb-2 border-b border-border">
        Cloud providers
      </h2>
      <div className="mb-6">
        <CloudProvidersSection />
      </div>

      {/* ---- Advanced ---- */}
      <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3 pb-2 border-b border-border">
        Advanced
      </h2>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={() => detect.mutate()}
          disabled={detect.isPending}
          className="px-3 py-1.5 text-xs font-mono border border-border text-text-3
                     hover:border-accent-dim hover:text-text-1 transition-colors disabled:opacity-50"
        >
          {detect.isPending ? "Scanning..." : "Scan for local servers"}
        </button>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          className="px-3 py-1.5 text-xs font-mono border border-border text-text-3
                     hover:border-accent-dim hover:text-text-1 transition-colors"
        >
          Custom endpoint...
        </button>
      </div>
      <p className="text-2xs text-text-4 mb-4 max-w-prose">
        The scan finds LM Studio, llama.cpp, or Ollama already running on this machine. A custom
        endpoint connects any other OpenAI-compatible server.
      </p>

      {detect.isError && (
        <p role="alert" className="text-xs text-error mb-3">
          {formatError(detect.error)}
        </p>
      )}

      {showAdvanced && (
        <div className="p-4 border border-border bg-surface-2 mb-6">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label htmlFor="provider-name" className="block text-xs font-mono text-text-4 mb-1">
                Name
              </label>
              <input
                id="provider-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                           outline-none focus:border-accent-dim"
              />
            </div>
            <div>
              <label htmlFor="provider-model" className="block text-xs font-mono text-text-4 mb-1">
                Model
              </label>
              <input
                id="provider-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                           outline-none focus:border-accent-dim"
              />
            </div>
            <div>
              <label
                htmlFor="provider-base-url"
                className="block text-xs font-mono text-text-4 mb-1"
              >
                Base URL
              </label>
              <input
                id="provider-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:1234"
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                           placeholder:text-text-4 outline-none focus:border-accent-dim"
              />
            </div>
            <div>
              <label
                htmlFor="provider-api-key"
                className="block text-xs font-mono text-text-4 mb-1"
              >
                API Key (optional)
              </label>
              <input
                id="provider-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                           outline-none focus:border-accent-dim"
                placeholder="Leave empty for local"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm text-text-2">
              <input
                type="checkbox"
                checked={isLocal}
                onChange={(e) => setIsLocal(e.target.checked)}
              />
              Local provider
            </label>
          </div>
          {register.isError && (
            <p role="alert" className="text-xs text-error mb-3">
              {formatError(register.error)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdvancedRegister}
              disabled={register.isPending || !name || !baseUrl || !model}
              className="px-3 py-1 text-xs font-mono bg-primary text-on-primary disabled:opacity-50"
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => setShowAdvanced(false)}
              className="px-3 py-1 text-xs font-mono text-text-3 border border-border"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Full registry, for transparency: everything the router knows about */}
      {hasProviders && (
        <>
          <h3 className="text-2xs font-mono tracking-widest uppercase text-text-4 mb-2">
            All registered providers ({providers?.length})
          </h3>
          {setActive.isError && (
            <p role="alert" className="text-xs text-error mb-2">
              {formatError(setActive.error)}
            </p>
          )}
          {providers?.map((p) => (
            <div
              key={p.index}
              className={`flex items-center justify-between p-3 border mb-1 ${
                p.is_active ? "border-accent-dim bg-surface-2" : "border-border"
              }`}
            >
              <div className="min-w-0">
                <span className="text-sm text-text-1 font-medium">{p.name}</span>
                <span className="text-xs font-mono text-text-4 ml-2">
                  {p.model ? `${p.model} · ` : ""}
                  {p.is_local ? "local" : "cloud"}
                  {p.is_available ? "" : " · not answering"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.is_active ? (
                  <span className="text-xs font-mono text-accent">Active</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActive.mutate(p.index)}
                    className="text-xs font-mono text-text-3 hover:text-text-1"
                  >
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
