/*
 * Name: use-local-model-autostart.ts
 * Purpose: Bring the local model back on launch so offline users land on a
 *   working state without a manual Start.
 * Description: The bundled llama-server does not persist across restarts (its
 *   provider is registered in memory when the server becomes ready), so an
 *   offline user who only has a downloaded model would otherwise face every AI
 *   feature reporting "no model" on each launch. This runs once at startup and
 *   starts the server only when it is the user's single option: no provider is
 *   active, none is saved (so the backend is not about to restore a cloud or
 *   Ollama provider), the sidecar is bundled, a GGUF model is downloaded, and
 *   the server is idle. A saved cloud provider (Gemini, OpenAI, Ollama) always
 *   wins, so this never fights the user's configured choice or loads a
 *   multi-GB model behind their back when they use the cloud.
 * Tech Stack: React 19, TanStack Query, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-23
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import type { ModelFileInfo, SavedProviderInfo, SidecarStatus } from "@/types/models";

export function useLocalModelAutostart() {
  const queryClient = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        /* A provider is already active (or about to be restored): leave it be. */
        if (await tauriInvoke<string | null>("get_active_provider_name")) return;
        const saved = await tauriInvoke<SavedProviderInfo[]>("list_saved_providers");
        if (saved.length > 0) return;

        /* The local sidecar is the user's only option. Start it if a model is
           downloaded and the server is idle. */
        if (!(await tauriInvoke<boolean>("sidecar_available"))) return;
        const models = await tauriInvoke<ModelFileInfo[]>("list_local_models");
        if (models.length === 0) return;
        const status = await tauriInvoke<SidecarStatus>("get_sidecar_status");
        if (status.state !== "stopped" && status.state !== "crashed") return;

        await tauriInvoke<SidecarStatus>("start_sidecar", { model_path: null });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SIDECAR, "status"] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ACTIVE_PROVIDER] });
      } catch {
        /* Best-effort: the model notice and the Local AI Server card both still
           offer a manual Start if this does not fire. */
      }
    })();
  }, [queryClient]);
}
