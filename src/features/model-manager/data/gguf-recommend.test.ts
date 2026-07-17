/*
 * Name: gguf-recommend.test.ts
 * Purpose: Pin the bundled-model recommendation behavior.
 * Description: The recommendation drives the "Recommended for this computer"
 *   badge, so its boundaries are locked here: comfortable fit wins, largest
 *   first; minimum-only fit is the fallback; the smallest model is the floor;
 *   and missing hardware data recommends the dependable default.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

import { describe, expect, it } from "vitest";

import type { GgufCatalogEntry } from "@/types/models";
import { recommendGguf } from "./gguf-recommend";

const entry = (
  id: string,
  minRam: number,
  recommendedRam: number,
): GgufCatalogEntry => ({
  id,
  label: id,
  params: "nB",
  filename: `${id}.gguf`,
  download_gb: 1,
  min_ram_gb: minRam,
  recommended_ram_gb: recommendedRam,
  use_note: "",
});

/* Ordered small to large, like the real catalog. */
const CATALOG = [
  entry("llama-3.2-1b", 4, 8),
  entry("llama-3.2-3b", 8, 8),
  entry("qwen3-4b", 8, 16),
  entry("mistral-7b", 16, 16),
];

describe("recommendGguf", () => {
  it("picks the largest comfortable fit", () => {
    expect(recommendGguf(CATALOG, 16)?.id).toBe("mistral-7b");
    expect(recommendGguf(CATALOG, 8)?.id).toBe("llama-3.2-3b");
  });

  it("tolerates nominal RAM reporting slightly under", () => {
    expect(recommendGguf(CATALOG, 15.9)?.id).toBe("mistral-7b");
  });

  it("stays comfortable rather than stretching to a tight fit", () => {
    /* 12 GB fits qwen3-4b's minimum but not its recommended 16; the honest
       recommendation is the largest comfortable model. */
    expect(recommendGguf(CATALOG, 12)?.id).toBe("llama-3.2-3b");
  });

  it("falls back to the largest minimum-fit, then the smallest entry", () => {
    const tightCatalog = [entry("small", 4, 16), entry("big", 8, 16)];
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
