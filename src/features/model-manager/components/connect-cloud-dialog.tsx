/*
 * Name: connect-cloud-dialog.tsx
 * Purpose: Guided three-step wizard for connecting a cloud AI provider.
 * Description: Walks a user through connecting OpenAI, Anthropic, Gemini, or
 *   DeepSeek without assuming they know what an API key is. Step 1 explains
 *   what they need with a direct link to the provider's key page and an honest
 *   cost note. Step 2 takes the key (masked, with a show toggle and a soft
 *   format hint that warns but never blocks, since providers change prefixes)
 *   and the model (suggested picks plus a custom field). Step 3 saves, then
 *   probes the connection and reports plainly: connected, or saved-but-not-
 *   answering with likely causes. The key is only ever sent to the provider
 *   itself; the backend enforces https and never returns stored keys.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

import { useEffect, useRef, useState } from "react";

import { tauriInvoke } from "@/services/tauri-client";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import type { ProviderInfo } from "@/types/models";

import type { CloudProviderDef } from "../data/cloud-providers";
import { useRegisterProvider, useSetActiveProvider } from "../hooks/use-model-management";

interface ConnectCloudDialogProps {
  provider: CloudProviderDef;
  onClose: () => void;
}

type Step = "intro" | "details" | "result";

export function ConnectCloudDialog({ provider, onClose }: ConnectCloudDialogProps) {
  const [step, setStep] = useState<Step>("intro");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelId, setModelId] = useState(provider.models[0]?.id ?? "");
  const [customModel, setCustomModel] = useState("");
  const [verified, setVerified] = useState<boolean | null>(null);

  const register = useRegisterProvider();
  const setActive = useSetActiveProvider();
  const dialogRef = useRef<HTMLDivElement>(null);

  /* Focus the dialog on open so keyboard and screen-reader users land inside;
     Escape closes from anywhere within. */
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const chosenModel = modelId === "__custom__" ? customModel.trim() : modelId;
  const keyLooksOff =
    apiKey.trim().length > 0 && !apiKey.trim().startsWith(provider.keyPrefix);

  const connect = async () => {
    setStep("result");
    setVerified(null);
    try {
      const index = await register.mutateAsync({
        name: provider.name,
        kind: provider.kind,
        base_url: provider.baseUrl,
        api_key: apiKey.trim(),
        model: chosenModel,
        is_local: false,
      });
      /* Make it the active model no matter what the reachability probe says.
         The user connected this provider to use it, and the probe (a 4s GET on
         /v1/models or /v1beta/models) can fail while chat still works: a slow
         network, or a key allowed to generate but not to list models. Gating
         activation on the probe left users saved-but-not-active, still pointed
         at whatever was active before (often the slow local server). The probe
         now only informs the result message. */
      await setActive.mutateAsync(index);
      const providers = await tauriInvoke<ProviderInfo[]>("list_providers");
      const mine = providers.find((p) => p.name === provider.name);
      setVerified(mine?.is_available ?? false);
    } catch {
      /* register.isError renders the message on the result step */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Connect ${provider.name}`}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className="w-[460px] max-w-full border border-border bg-surface shadow-xl outline-none
                   max-h-[calc(100vh-32px)] overflow-y-auto"
      >
        <div className="p-5">
          <p className="text-2xs font-mono uppercase tracking-widest text-text-4 mb-1">
            Connect a cloud provider
          </p>
          <h2 className="text-lg font-display font-bold text-text-1 mb-1">{provider.name}</h2>
          <p className="text-sm text-text-3 mb-4">{provider.blurb}</p>

          {step === "intro" && (
            <>
              <div className="space-y-3 mb-5">
                <div className="flex gap-3">
                  <StepBadge n={1} />
                  <div>
                    <p className="text-sm font-semibold text-text-1">Get an API key</p>
                    <p className="text-xs text-text-3 mt-0.5 leading-relaxed">
                      An API key is a private password that lets apps use your {provider.name}{" "}
                      account. Create one at{" "}
                      <a
                        href={provider.keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline underline-offset-2"
                      >
                        {provider.keyUrl.replace("https://", "")}
                      </a>
                      , then copy it.
                    </p>
                    <p className="text-2xs font-mono text-text-4 mt-1">{provider.costNote}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <StepBadge n={2} />
                  <div>
                    <p className="text-sm font-semibold text-text-1">Paste it here</p>
                    <p className="text-xs text-text-3 mt-0.5 leading-relaxed">
                      The key is stored only on this machine and sent only to {provider.name}.
                      You can remove it anytime.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <StepBadge n={3} />
                  <div>
                    <p className="text-sm font-semibold text-text-1">Start working</p>
                    <p className="text-xs text-text-3 mt-0.5 leading-relaxed">
                      We test the connection and make it your active model.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className={secondaryButton}>
                  Cancel
                </button>
                <button type="button" onClick={() => setStep("details")} className={primaryButton}>
                  I have my key
                </button>
              </div>
            </>
          )}

          {step === "details" && (
            <>
              <label
                htmlFor="cloud-api-key"
                className="block text-xs font-mono text-text-4 mb-1"
              >
                API key
              </label>
              <div className="flex gap-1.5 mb-1">
                <input
                  id="cloud-api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider.keyPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="flex-1 px-3 py-2 text-sm bg-surface border border-border text-text-1
                             placeholder:text-text-4 outline-none focus:border-accent-dim font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-pressed={showKey}
                  className={secondaryButton}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              {keyLooksOff && (
                <p className="text-2xs text-amber-500 mb-2">
                  Keys from {provider.name} usually start with "{provider.keyPrefix}". Double-check
                  you copied the right one; you can still continue.
                </p>
              )}
              <p className="text-2xs text-text-4 mb-4">
                Stored only on this machine, sent only to {provider.name}.
              </p>

              <p className="block text-xs font-mono text-text-4 mb-1.5">Model</p>
              <div className="space-y-1.5 mb-4" role="radiogroup" aria-label="Model">
                {provider.models.map((m) => (
                  <label
                    key={m.id}
                    className={cn(
                      "flex items-center gap-2.5 border px-3 py-2 cursor-pointer transition-colors",
                      modelId === m.id ? "border-accent-dim bg-surface-2" : "border-border",
                    )}
                  >
                    <input
                      type="radio"
                      name="cloud-model"
                      checked={modelId === m.id}
                      onChange={() => setModelId(m.id)}
                    />
                    <span className="text-sm text-text-1">{m.label}</span>
                    <span className="text-2xs font-mono text-text-4 ml-auto">{m.note}</span>
                  </label>
                ))}
                <label
                  className={cn(
                    "flex items-center gap-2.5 border px-3 py-2 cursor-pointer transition-colors",
                    modelId === "__custom__" ? "border-accent-dim bg-surface-2" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="cloud-model"
                    checked={modelId === "__custom__"}
                    onChange={() => setModelId("__custom__")}
                  />
                  <span className="text-sm text-text-1">Another model id</span>
                  {modelId === "__custom__" && (
                    <input
                      type="text"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      placeholder="model-id"
                      aria-label="Custom model id"
                      className="flex-1 ml-2 px-2 py-1 text-xs font-mono bg-surface border border-border
                                 text-text-1 outline-none focus:border-accent-dim"
                    />
                  )}
                </label>
              </div>

              <div className="flex justify-between gap-2">
                <button type="button" onClick={() => setStep("intro")} className={secondaryButton}>
                  Back
                </button>
                <button
                  type="button"
                  onClick={connect}
                  disabled={!apiKey.trim() || !chosenModel}
                  className={primaryButton}
                >
                  Connect
                </button>
              </div>
            </>
          )}

          {step === "result" && (
            <>
              {register.isPending || (register.isSuccess && verified === null) ? (
                <p className="text-sm text-text-2 mb-4" aria-live="polite">
                  Testing the connection to {provider.name}...
                </p>
              ) : register.isError ? (
                <>
                  <p className="text-sm font-semibold text-error mb-1">Could not save</p>
                  <p role="alert" className="text-xs text-text-3 mb-4">
                    {formatError(register.error)}
                  </p>
                </>
              ) : verified ? (
                <>
                  <p className="text-sm font-semibold text-mark mb-1">Connected</p>
                  <p className="text-xs text-text-3 mb-4">
                    {provider.name} answered and is now your active model. Chat, the Studio, and
                    every other AI feature will use it.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-amber-500 mb-1">
                    Set as active, but the test did not answer
                  </p>
                  <p className="text-xs text-text-3 mb-4 leading-relaxed">
                    {provider.name} is now your active model, but it did not answer the quick test
                    call. That is often just a slow network or a key that cannot list models, so try
                    a question first. If chat fails, the usual causes are a key copied incompletely,
                    no credit yet, or a network that blocks the API. Edit the key from the provider
                    card anytime.
                  </p>
                </>
              )}
              <div className="flex justify-end gap-2">
                {register.isError || verified === false ? (
                  <button
                    type="button"
                    onClick={() => setStep("details")}
                    className={secondaryButton}
                  >
                    Back
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  disabled={register.isPending}
                  className={primaryButton}
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const primaryButton =
  "px-4 py-2 text-xs font-mono bg-primary text-on-primary hover:bg-primary-hover " +
  "transition-colors disabled:opacity-50";
const secondaryButton =
  "px-3 py-2 text-xs font-mono border border-border text-text-3 hover:text-text-1 " +
  "hover:border-accent-dim transition-colors";

function StepBadge({ n }: { n: number }) {
  return (
    <span
      className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-xs font-mono
                 font-bold bg-primary text-on-primary"
      aria-hidden="true"
    >
      {n}
    </span>
  );
}
