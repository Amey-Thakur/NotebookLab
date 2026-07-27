/*
 * Name: model-required-notice.tsx
 * Purpose: Gentle heads-up on AI features when no model is loaded, with a
 *   one-click start when a local model is downloaded but not running.
 * Description: The AI features (chat, the Studio, thinking partner, transforms,
 *   audio overview, prompt crafting) need an active model. A brand-new user has
 *   none right after onboarding, so instead of letting them try and hit an
 *   error, this shows a calm inline banner. When a bundled model is already
 *   downloaded but its Local AI Server is stopped, the banner offers a Start
 *   button right here, so the user never has to hunt for the Models page to go
 *   from "downloaded" to "answering". It reads the active provider (shared
 *   query with the status bar) and renders nothing once a model is active, so
 *   it quietly disappears the moment one is loaded.
 * Tech Stack: React 19, TanStack Query, React Router
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-23
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import type { ModelFileInfo, SidecarStatus } from "@/types/models";

export function ModelRequiredNotice({ action = "This feature" }: { action?: string }) {
  const queryClient = useQueryClient();

  const { data: activeProvider, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.ACTIVE_PROVIDER],
    queryFn: () => tauriInvoke<string | null>("get_active_provider_name"),
    refetchInterval: 10000,
  });

  /* Only the "no provider" state needs these, so gate them on it. They tell us
     whether a one-click local start is possible: the bundled server exists, a
     model is downloaded, and the server is not already running. */
  const noProvider = !isLoading && !activeProvider;

  const { data: sidecarAvailable } = useQuery({
    queryKey: [QUERY_KEYS.SIDECAR, "available"],
    queryFn: () => tauriInvoke<boolean>("sidecar_available"),
    staleTime: Infinity,
    enabled: noProvider,
  });

  const { data: localModels } = useQuery({
    queryKey: [QUERY_KEYS.SIDECAR, "models"],
    queryFn: () => tauriInvoke<ModelFileInfo[]>("list_local_models"),
    enabled: noProvider && sidecarAvailable === true,
  });

  const { data: status } = useQuery({
    queryKey: [QUERY_KEYS.SIDECAR, "status"],
    queryFn: () => tauriInvoke<SidecarStatus>("get_sidecar_status"),
    enabled: noProvider && sidecarAvailable === true,
    /* Poll quickly while starting so the banner clears as soon as the model
       loads and the backend auto-activates it as the provider. */
    refetchInterval: (query) => (query.state.data?.state === "starting" ? 2000 : false),
  });

  const start = useMutation({
    mutationFn: () => tauriInvoke<SidecarStatus>("start_sidecar", { model_path: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SIDECAR, "status"] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ACTIVE_PROVIDER] });
    },
  });

  /* Stay quiet until we know, and once a model is active. */
  if (isLoading || activeProvider) return null;

  const serverState = status?.state ?? "stopped";
  const hasLocalModel = sidecarAvailable === true && (localModels?.length ?? 0) > 0;
  const canStartLocal = hasLocalModel && (serverState === "stopped" || serverState === "crashed");
  const isStartingLocal = hasLocalModel && (serverState === "starting" || start.isPending);

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-surface-2 px-4 py-3"
    >
      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />

      {isStartingLocal ? (
        <p className="text-sm text-text-2">
          Starting your local model. This can take a minute on the first run, then {action} will answer.
        </p>
      ) : canStartLocal ? (
        <>
          <p className="text-sm text-text-2">
            {action} needs a model. Your downloaded local model is ready to start.
          </p>
          <button
            type="button"
            onClick={() => start.mutate()}
            disabled={start.isPending}
            className="text-sm font-mono text-accent hover:underline disabled:opacity-50"
          >
            Start local model
          </button>
          {start.isError && (
            <span role="alert" className="text-sm text-error">
              {formatError(start.error)}
            </span>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-text-2">{action} needs an AI model, and none is loaded yet.</p>
          <Link to={ROUTES.MODELS} className="text-sm font-mono text-accent hover:underline">
            Set one up in Models
          </Link>
        </>
      )}
    </div>
  );
}
