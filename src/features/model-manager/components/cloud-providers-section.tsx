/*
 * Name: cloud-providers-section.tsx
 * Purpose: Cloud provider cards: connect, switch, edit, and remove.
 * Description: One card per supported provider (Anthropic, OpenAI, Gemini,
 *   DeepSeek). Unconnected cards invite with a one-line pitch and honest cost
 *   note; connecting opens the guided wizard. Connected cards show the chosen
 *   model, live availability, and plain actions: make active, change the key
 *   or model (the wizard again, prefilled model), and remove (two-step
 *   confirm). Removal deletes the stored key. Availability comes from the
 *   shared provider listing, so the header switcher and these cards always
 *   agree.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

import { useState } from "react";

import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";

import { CLOUD_PROVIDERS, type CloudProviderDef } from "../data/cloud-providers";
import {
  useDeleteProvider,
  useProviders,
  useSavedProviders,
  useSetActiveProvider,
} from "../hooks/use-model-management";
import { ConnectCloudDialog } from "./connect-cloud-dialog";

export function CloudProvidersSection() {
  const saved = useSavedProviders();
  const providers = useProviders();
  const setActive = useSetActiveProvider();
  const remove = useDeleteProvider();

  const [connecting, setConnecting] = useState<CloudProviderDef | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  return (
    <div>
      <p className="text-xs text-text-3 mb-3 max-w-prose">
        Bigger models without the hardware: bring your own API key. Keys are stored only on this
        machine and sent only to the provider they belong to; your notes and documents still never
        leave your computer except for the text sent with each AI request.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CLOUD_PROVIDERS.map((def) => {
          const savedEntry = saved.data?.find((s) => s.kind === def.kind);
          const live = providers.data?.find((p) => p.name === savedEntry?.name);
          const isRemoving = confirmingRemove === def.kind;

          return (
            <div key={def.kind} className="border border-border p-3 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-text-1">{def.name}</span>
                {savedEntry ? (
                  live?.is_active ? (
                    <span className="text-2xs font-mono text-accent">Active</span>
                  ) : (
                    <span
                      className={cn(
                        "text-2xs font-mono",
                        live?.is_available ? "text-mark" : "text-text-4",
                      )}
                    >
                      {live?.is_available ? "Connected" : "Not answering"}
                    </span>
                  )
                ) : null}
              </div>

              <p className="text-xs text-text-3 leading-relaxed mb-2">{def.blurb}</p>

              {savedEntry ? (
                <>
                  <p className="text-2xs font-mono text-text-4 mb-3">
                    Model: {savedEntry.model}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    {!live?.is_active && live && (
                      <button
                        type="button"
                        onClick={() => setActive.mutate(live.index)}
                        disabled={setActive.isPending}
                        className="px-2.5 py-1 text-2xs font-mono bg-primary text-on-primary
                                   hover:bg-primary-hover transition-colors disabled:opacity-50"
                      >
                        Make active
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setConnecting(def)}
                      className="px-2.5 py-1 text-2xs font-mono border border-border text-text-3
                                 hover:text-text-1 hover:border-accent-dim transition-colors"
                    >
                      Change key or model
                    </button>
                    {isRemoving ? (
                      <span className="flex items-center gap-1.5 text-2xs font-mono">
                        <button
                          type="button"
                          onClick={() => {
                            remove.mutate(savedEntry.name);
                            setConfirmingRemove(null);
                          }}
                          className="text-error hover:underline"
                        >
                          Remove key
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRemove(null)}
                          className="text-text-4 hover:text-text-2"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingRemove(def.kind)}
                        className="px-2 py-1 text-2xs font-mono text-text-4 hover:text-error transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-2xs font-mono text-text-4 mb-3">{def.costNote}</p>
                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={() => setConnecting(def)}
                      className="px-3 py-1.5 text-xs font-mono border border-border text-text-2
                                 hover:border-accent-dim hover:text-text-1 transition-colors"
                    >
                      Connect
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {remove.isError && (
        <p role="alert" className="text-xs text-error mt-2">
          {formatError(remove.error)}
        </p>
      )}

      {connecting && (
        <ConnectCloudDialog provider={connecting} onClose={() => setConnecting(null)} />
      )}
    </div>
  );
}
