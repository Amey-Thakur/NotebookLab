/*
 * Name: prompt-api.ts
 * Purpose: IPC wrapper and tolerant parser for the prompt crafter.
 * Description: craftPrompt calls the backend in "generate" or "refine" mode and
 *   returns the model's raw text. parseCrafted turns that text into a typed
 *   result: it reads the JSON envelope (prompt, settings, variables, notes)
 *   when present and well formed, and otherwise falls back to treating the
 *   whole reply as the prompt, so a model that ignores the format can never
 *   crash the page or lose the user's result.
 * Tech Stack: TypeScript, Tauri IPC
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { tauriInvoke } from "@/services/tauri-client";
import { extractJson } from "@/features/studio/api/studio-api";

export type CraftMode = "generate" | "refine";

export interface CraftedVariable {
  name: string;
  purpose: string;
}

export interface CraftedSettings {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
}

export interface CraftedPrompt {
  prompt: string;
  settings: CraftedSettings;
  variables: CraftedVariable[];
  notes: string[];
}

export function craftPrompt(input: string, mode: CraftMode): Promise<string> {
  return tauriInvoke<string>("craft_prompt", { input, mode });
}

/**
 * Parse the crafter's reply into a typed result, tolerating every deviation:
 * a bare prompt with no JSON, a wrapped envelope, mistyped fields. The prompt
 * itself is never lost; unusable extras simply come back empty.
 */
export function parseCrafted(text: string): CraftedPrompt {
  const fallback: CraftedPrompt = {
    prompt: text.trim(),
    settings: {},
    variables: [],
    notes: [],
  };
  if (!text.trim()) return { ...fallback, prompt: "" };

  let raw: unknown;
  try {
    raw = extractJson<unknown>(text);
  } catch {
    return fallback;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;

  const envelope = raw as Record<string, unknown>;
  const prompt = typeof envelope.prompt === "string" ? envelope.prompt.trim() : "";
  if (!prompt) return fallback;

  const settingsRaw =
    envelope.settings && typeof envelope.settings === "object" && !Array.isArray(envelope.settings)
      ? (envelope.settings as Record<string, unknown>)
      : {};
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  const variables: CraftedVariable[] = Array.isArray(envelope.variables)
    ? envelope.variables.flatMap((v) => {
        if (typeof v === "string" && v.trim()) return [{ name: v.trim(), purpose: "" }];
        if (v && typeof v === "object") {
          const entry = v as Record<string, unknown>;
          if (typeof entry.name === "string" && entry.name.trim()) {
            return [
              {
                name: entry.name.trim(),
                purpose: typeof entry.purpose === "string" ? entry.purpose : "",
              },
            ];
          }
        }
        return [];
      })
    : [];

  const notes: string[] = Array.isArray(envelope.notes)
    ? envelope.notes.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    : [];

  return {
    prompt,
    settings: {
      temperature: num(settingsRaw.temperature),
      top_p: num(settingsRaw.top_p),
      top_k: num(settingsRaw.top_k),
      max_tokens: num(settingsRaw.max_tokens),
    },
    variables,
    notes,
  };
}
