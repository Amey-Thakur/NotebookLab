/*
 * Name: model-catalog.ts
 * Purpose: Curated catalog of local models installable through Ollama.
 * Description: A hand-picked selection of capable open models that run well on
 *   consumer hardware, spanning the major families (Llama, Gemma, Qwen,
 *   DeepSeek, Mistral, Phi) and the use cases the app cares about. Each entry
 *   carries the Ollama tag, approximate download size, and the RAM it needs,
 *   so the UI can mark what fits this computer and warn before an install
 *   that will not. Sizes are approximate (quantized builds change); the fit
 *   classification keys off RAM headroom, the safe lower bound when no GPU is
 *   detected. Ratings are a relative quality-for-size guide within this list,
 *   not a benchmark.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

export type UseCase = "chat" | "reasoning" | "coding" | "writing" | "vision" | "long context";

export interface CatalogModel {
  /** The exact Ollama tag `ollama pull` accepts. */
  tag: string;
  family: string;
  label: string;
  /** Parameter count as shown to users ("3B", "7B"). */
  params: string;
  /** Approximate download size in GB. */
  downloadGb: number;
  /** Minimum system RAM to run at all (GB). */
  minRamGb: number;
  /** RAM for a comfortable experience (GB). */
  recommendedRamGb: number;
  useCases: UseCase[];
  /** Relative quality-for-size within this catalog, 1-5. */
  rating: 1 | 2 | 3 | 4 | 5;
  blurb: string;
}

export const MODEL_CATALOG: CatalogModel[] = [
  {
    tag: "llama3.2:3b",
    family: "Llama",
    label: "Llama 3.2",
    params: "3B",
    downloadGb: 2.0,
    minRamGb: 8,
    recommendedRamGb: 8,
    useCases: ["chat", "writing"],
    rating: 4,
    blurb: "The dependable starter: quick, capable, and light enough for most laptops.",
  },
  {
    tag: "gemma3:1b",
    family: "Gemma",
    label: "Gemma 3",
    params: "1B",
    downloadGb: 0.8,
    minRamGb: 4,
    recommendedRamGb: 8,
    useCases: ["chat"],
    rating: 2,
    blurb: "Tiny and fast. The pick for older machines where every gigabyte counts.",
  },
  {
    tag: "gemma3:4b",
    family: "Gemma",
    label: "Gemma 3",
    params: "4B",
    downloadGb: 3.3,
    minRamGb: 8,
    recommendedRamGb: 16,
    useCases: ["chat", "writing", "vision"],
    rating: 4,
    blurb: "Google's compact all-rounder; understands images as well as text.",
  },
  {
    tag: "gemma3:12b",
    family: "Gemma",
    label: "Gemma 3",
    params: "12B",
    downloadGb: 8.1,
    minRamGb: 16,
    recommendedRamGb: 32,
    useCases: ["chat", "writing", "reasoning", "vision"],
    rating: 5,
    blurb: "Noticeably sharper writing and reasoning when your machine can carry it.",
  },
  {
    tag: "qwen3:4b",
    family: "Qwen",
    label: "Qwen 3",
    params: "4B",
    downloadGb: 2.6,
    minRamGb: 8,
    recommendedRamGb: 16,
    useCases: ["chat", "reasoning", "long context"],
    rating: 4,
    blurb: "Punches above its size on reasoning and handles long documents well.",
  },
  {
    tag: "qwen3:8b",
    family: "Qwen",
    label: "Qwen 3",
    params: "8B",
    downloadGb: 5.2,
    minRamGb: 16,
    recommendedRamGb: 16,
    useCases: ["chat", "reasoning", "coding", "long context"],
    rating: 5,
    blurb: "A strong generalist with real reasoning depth; great with 16 GB or more.",
  },
  {
    tag: "qwen2.5-coder:7b",
    family: "Qwen",
    label: "Qwen 2.5 Coder",
    params: "7B",
    downloadGb: 4.7,
    minRamGb: 16,
    recommendedRamGb: 16,
    useCases: ["coding"],
    rating: 4,
    blurb: "Purpose-built for code: completion, explanation, and refactoring.",
  },
  {
    tag: "deepseek-r1:1.5b",
    family: "DeepSeek",
    label: "DeepSeek R1",
    params: "1.5B",
    downloadGb: 1.1,
    minRamGb: 4,
    recommendedRamGb: 8,
    useCases: ["reasoning"],
    rating: 3,
    blurb: "Shows its chain of thought while staying small enough for any machine.",
  },
  {
    tag: "deepseek-r1:7b",
    family: "DeepSeek",
    label: "DeepSeek R1",
    params: "7B",
    downloadGb: 4.7,
    minRamGb: 16,
    recommendedRamGb: 16,
    useCases: ["reasoning", "coding"],
    rating: 4,
    blurb: "Deliberate step-by-step reasoning for harder questions, run locally.",
  },
  {
    tag: "mistral:7b",
    family: "Mistral",
    label: "Mistral",
    params: "7B",
    downloadGb: 4.4,
    minRamGb: 16,
    recommendedRamGb: 16,
    useCases: ["chat", "writing"],
    rating: 3,
    blurb: "A proven, efficient classic with a clean, direct writing style.",
  },
  {
    tag: "phi4-mini:3.8b",
    family: "Phi",
    label: "Phi-4 Mini",
    params: "3.8B",
    downloadGb: 2.5,
    minRamGb: 8,
    recommendedRamGb: 16,
    useCases: ["chat", "reasoning"],
    rating: 3,
    blurb: "Microsoft's small model tuned for logic and math on modest hardware.",
  },
  {
    tag: "phi4:14b",
    family: "Phi",
    label: "Phi-4",
    params: "14B",
    downloadGb: 9.1,
    minRamGb: 16,
    recommendedRamGb: 32,
    useCases: ["reasoning", "coding", "chat"],
    rating: 5,
    blurb: "Exceptional reasoning for its class; the pick for well-equipped machines.",
  },
  {
    tag: "llava:7b",
    family: "LLaVA",
    label: "LLaVA",
    params: "7B",
    downloadGb: 4.7,
    minRamGb: 16,
    recommendedRamGb: 16,
    useCases: ["vision", "chat"],
    rating: 3,
    blurb: "Describes and answers questions about images alongside normal chat.",
  },
];

export type HardwareFit = "fits" | "tight" | "too-large" | "unknown";

/** Classify how a model sits on this computer's RAM. Conservative on purpose:
    system RAM is the safe bound whether or not a GPU is present. */
export function classifyFit(model: CatalogModel, totalRamGb: number | undefined): HardwareFit {
  if (!totalRamGb || totalRamGb <= 0) return "unknown";
  /* Real machines report slightly under the nominal size (15.9 for "16 GB"),
     so allow a small tolerance before calling a model too large. */
  const ram = totalRamGb + 0.75;
  if (ram < model.minRamGb) return "too-large";
  if (ram < model.recommendedRamGb) return "tight";
  return "fits";
}

export const FIT_LABEL: Record<HardwareFit, string> = {
  fits: "Fits this computer",
  tight: "Tight fit",
  "too-large": "Too large for this computer",
  unknown: "",
};

export const USE_CASES: UseCase[] = [
  "chat",
  "reasoning",
  "coding",
  "writing",
  "vision",
  "long context",
];
