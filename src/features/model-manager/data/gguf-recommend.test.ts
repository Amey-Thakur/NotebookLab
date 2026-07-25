/*
 * Name: gguf-recommend.test.ts
 * Purpose: Pin the bundled-model recommendation behavior.
 * Description: The recommendation drives the "Recommended for this computer"
 *   badge, so its boundaries are locked here: the strongest comfortable fit
 *   that stays responsive on CPU wins; a comfortable-but-heavy model is only
 *   recommended when nothing responsive fits; minimum-only fit is the
 *   fallback; the smallest model is the floor; and missing hardware data
 *   recommends the dependable default.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-23
 */

import { describe, expect, it } from "vitest";

import type { GgufCatalogEntry } from "@/types/models";
import { recommendGguf } from "./gguf-recommend";

const entry = (
  id: string,
  params: string,
  minRam: number,
  recommendedRam: number,
): GgufCatalogEntry => ({
  id,
  label: id,
  params,
  filename: `${id}.gguf`,
  download_gb: 1,
  min_ram_gb: minRam,
  recommended_ram_gb: recommendedRam,
  use_note: "",
});

/* Ordered small to large, like the real catalog. */
const CATALOG = [
  entry("llama-3.2-1b", "1B", 4, 8),
  entry("llama-3.2-3b", "3B", 8, 8),
  entry("qwen3-4b", "4B", 8, 16),
  entry("mistral-7b", "7B", 16, 16),
];

describe("recommendGguf", () => {
  it("picks the largest responsive comfortable fit, not the largest overall", () => {
    /* 16 GB fits mistral-7b comfortably, but a 7B answers too slowly on CPU
       to be the automatic pick; the strongest responsive model wins instead. */
    expect(recommendGguf(CATALOG, 16)?.id).toBe("qwen3-4b");
    expect(recommendGguf(CATALOG, 8)?.id).toBe("llama-3.2-3b");
  });

  it("tolerates nominal RAM reporting slightly under", () => {
    expect(recommendGguf(CATALOG, 15.9)?.id).toBe("qwen3-4b");
  });

  it("stays comfortable rather than stretching to a tight fit", () => {
    /* 12 GB fits qwen3-4b's minimum but not its recommended 16; the honest
       recommendation is the largest comfortable responsive model. */
    expect(recommendGguf(CATALOG, 12)?.id).toBe("llama-3.2-3b");
  });

  it("recommends a heavy comfortable model only when nothing responsive fits", () => {
    const heavyOnly = [
      entry("mistral-7b", "7B", 16, 16),
      entry("phi-4-14b", "14B", 16, 32),
    ];
    expect(recommendGguf(heavyOnly, 16)?.id).toBe("mistral-7b");
  });

  it("falls back to the largest minimum-fit, then the smallest entry", () => {
    const tightCatalog = [entry("small", "1B", 4, 16), entry("big", "3B", 8, 16)];
    /* Nothing is comfortable at 8 GB; the largest that meets its minimum wins. */
    expect(recommendGguf(tightCatalog, 8)?.id).toBe("big");
    /* Nothing meets even a minimum at 2 GB; the smallest entry is the floor. */
    expect(recommendGguf(CATALOG, 2)?.id).toBe("llama-3.2-1b");
  });

  it("recommends the dependable default without hardware data", () => {
    expect(recommendGguf(CATALOG, undefined)?.id).toBe("llama-3.2-3b");
    expect(recommendGguf([], 16)).toBeNull();
  });
});
