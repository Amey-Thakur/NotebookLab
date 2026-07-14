/*
 * Name: model-required-notice.tsx
 * Purpose: Gentle heads-up on AI features when no model is loaded.
 * Description: The AI features (chat, the Studio, thinking partner, transforms,
 *   audio overview, prompt crafting) need an active model. A brand-new user has
 *   none right after onboarding, so instead of letting them try and hit an
 *   error, this shows a calm inline banner with a one-click link to set one up.
 *   It reads the active provider (shared query with the status bar) and renders
 *   nothing once a model is active, so it quietly disappears the moment one is
 *   loaded.
 * Tech Stack: React 19, TanStack Query, React Router
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS, ROUTES } from "@/lib/constants";

export function ModelRequiredNotice({ action = "This feature" }: { action?: string }) {
  const { data: activeProvider, isLoading } = useQuery({
    queryKey: [QUERY_KEYS.ACTIVE_PROVIDER],
    queryFn: () => tauriInvoke<string | null>("get_active_provider_name"),
    refetchInterval: 10000,
  });

  /* Stay quiet until we know, and once a model is active. */
  if (isLoading || activeProvider) return null;

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-surface-2 px-4 py-3"
    >
      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
      <p className="text-sm text-text-2">{action} needs an AI model, and none is loaded yet.</p>
      <Link to={ROUTES.MODELS} className="text-sm font-mono text-accent hover:underline">
        Set one up in Models
      </Link>
    </div>
  );
}
