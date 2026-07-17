/*
 * Name: use-model-management.ts
 * Purpose: Shared queries and mutations for providers, Ollama, and hardware.
 * Description: One home for the model-management data layer so the Models
 *   page, the header model switcher, and the connect wizard stay in step
 *   through the query cache. Registering always persists (the backend writes
 *   the config), activating records the choice for the next launch, and every
 *   mutation invalidates the provider queries so all three surfaces update
 *   together. The hardware profile is fetched once and cached for the session
 *   since RAM and CPU do not change while the app runs.
 * Tech Stack: React 19, TanStack Query
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import type {
  HardwareProfile,
  OllamaModel,
  OllamaStatus,
  ProviderInfo,
  SavedProviderInfo,
} from "@/types/models";

export interface RegisterProviderPayload {
  name: string;
  kind: string;
  base_url: string;
  api_key: string | null;
  model: string;
  is_local: boolean;
}

export function useProviders() {
  return useQuery({
    queryKey: [QUERY_KEYS.PROVIDERS],
    queryFn: () => tauriInvoke<ProviderInfo[]>("list_providers"),
  });
}

export function useActiveProviderName() {
  return useQuery({
    queryKey: [QUERY_KEYS.ACTIVE_PROVIDER],
    queryFn: () => tauriInvoke<string | null>("get_active_provider_name"),
  });
}

export function useSavedProviders() {
  return useQuery({
    queryKey: [QUERY_KEYS.SAVED_PROVIDERS],
    queryFn: () => tauriInvoke<SavedProviderInfo[]>("list_saved_providers"),
  });
}

export function useOllamaStatus() {
  return useQuery({
    queryKey: [QUERY_KEYS.OLLAMA_STATUS],
    queryFn: () => tauriInvoke<OllamaStatus>("ollama_status"),
  });
}

export function useOllamaModels(enabled: boolean) {
  return useQuery({
    queryKey: [QUERY_KEYS.OLLAMA_MODELS],
    queryFn: () => tauriInvoke<OllamaModel[]>("ollama_installed_models"),
    enabled,
  });
}

export function useHardwareProfile() {
  return useQuery({
    queryKey: [QUERY_KEYS.HARDWARE],
    queryFn: () => tauriInvoke<HardwareProfile>("get_hardware_profile"),
    /* RAM and CPU do not change while the app runs. */
    staleTime: Infinity,
  });
}

/** Invalidate every provider-related query after a mutation. */
export function useInvalidateProviders() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PROVIDERS] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.ACTIVE_PROVIDER] });
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SAVED_PROVIDERS] });
  };
}

export function useRegisterProvider() {
  const invalidate = useInvalidateProviders();
  return useMutation({
    mutationFn: (input: RegisterProviderPayload) =>
      tauriInvoke<number>("register_provider", { input }),
    onSuccess: invalidate,
  });
}

export function useSetActiveProvider() {
  const invalidate = useInvalidateProviders();
  return useMutation({
    mutationFn: (index: number) => tauriInvoke<void>("set_active_provider", { index }),
    onSuccess: invalidate,
  });
}

export function useDeleteProvider() {
  const invalidate = useInvalidateProviders();
  return useMutation({
    mutationFn: (name: string) => tauriInvoke<void>("delete_provider", { name }),
    onSuccess: invalidate,
  });
}

export function useOllamaDeleteModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (model: string) => tauriInvoke<void>("ollama_delete_model", { model }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.OLLAMA_MODELS] });
    },
  });
}

/** Register (or refresh) the Ollama provider pointed at a given model and make
    it active. Used by "Use this model" on installed and freshly pulled models. */
export function useActivateOllamaModel() {
  const register = useRegisterProvider();
  const setActive = useSetActiveProvider();
  return useMutation({
    mutationFn: async (model: string) => {
      const index = await register.mutateAsync({
        name: "Ollama",
        kind: "ollama",
        base_url: "http://127.0.0.1:11434",
        api_key: null,
        model,
        is_local: true,
      });
      await setActive.mutateAsync(index);
    },
  });
}
