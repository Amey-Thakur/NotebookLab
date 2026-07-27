/*
 * Name: cloud-providers.ts
 * Purpose: Registry of first-class cloud AI providers and their guided setup.
 * Description: Everything the connect wizard needs to walk a user through each
 *   provider: where to create an API key, what the key looks like, which
 *   models to suggest, and an honest note about cost and free tiers. Model
 *   suggestions are editable in the wizard, so a newer model id can always be
 *   typed in. Base URLs are the official endpoints; the backend enforces
 *   https and re-validates everything. Adding a provider the backend already
 *   speaks (openai-compatible, anthropic, gemini) is one more entry here.
 *   Model ids expire: providers retire them on a schedule and a retired id
 *   fails every request with a 404, so these lists need a look whenever a
 *   provider announces a shutdown. The custom field is the escape hatch until
 *   then.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-27
 */

export interface CloudModelSuggestion {
  id: string;
  label: string;
  note: string;
}

export interface CloudProviderDef {
  kind: "openai" | "anthropic" | "gemini" | "deepseek";
  name: string;
  baseUrl: string;
  /** Where to create an API key. */
  keyUrl: string;
  /** Prefixes a key from this provider may start with, shown as a soft hint.
      A list because providers add new key formats without retiring the old
      ones: Google issues both "AIza..." and the newer "AQ..." keys, and
      warning on a valid key is worse than not warning at all. */
  keyPrefixes: string[];
  keyPlaceholder: string;
  blurb: string;
  costNote: string;
  models: CloudModelSuggestion[];
}

export const CLOUD_PROVIDERS: CloudProviderDef[] = [
  {
    kind: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefixes: ["sk-ant-"],
    keyPlaceholder: "sk-ant-...",
    blurb: "Claude models: strong reasoning, careful writing, and long documents.",
    costNote: "Paid API. New consoles usually include trial credit.",
    models: [
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "Best balance of quality and cost" },
      { id: "claude-opus-5", label: "Claude Opus 5", note: "Deepest reasoning" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", note: "Fast and inexpensive" },
    ],
  },
  {
    kind: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefixes: ["sk-"],
    keyPlaceholder: "sk-...",
    blurb: "GPT models: broad knowledge and strong all-round capability.",
    costNote: "Paid API, billed per token.",
    models: [
      { id: "gpt-5.1", label: "GPT-5.1", note: "Flagship quality" },
      { id: "gpt-5-mini", label: "GPT-5 mini", note: "Fast and inexpensive" },
      { id: "gpt-4o", label: "GPT-4o", note: "Proven previous generation" },
    ],
  },
  {
    kind: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPrefixes: ["AIza", "AQ."],
    keyPlaceholder: "AIza...",
    blurb: "Gemini models: fast, capable, and generous with long context.",
    costNote: "Has a real free tier; a Google account is enough to start.",
    models: [
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", note: "Latest; fast and capable" },
      { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", note: "Strongest for hard questions" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", note: "Cheapest and fastest" },
    ],
  },
  {
    kind: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyPrefixes: ["sk-"],
    keyPlaceholder: "sk-...",
    blurb: "Very capable models at some of the lowest API prices anywhere.",
    costNote: "Paid API, but markedly cheaper than the big labs.",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", note: "General purpose" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", note: "Step-by-step reasoning" },
    ],
  },
];

/** The display name a connected provider of this kind gets in the router. */
export function providerDisplayName(def: CloudProviderDef): string {
  return def.name;
}
