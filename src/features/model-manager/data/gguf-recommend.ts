/*
 * Name: gguf-recommend.ts
 * Purpose: Pick the bundled model this computer should start with.
 * Description: The catalog arrives ordered small to large, so the strongest
 *   model that still fits comfortably is the last one whose recommended RAM
 *   fits (with the same nominal-size tolerance the fit badges use). When
 *   nothing fits comfortably, fall back to the last that at least meets its
 *   minimum; when even that fails, the smallest entry is the honest answer.
 *   Kept as a pure function so the choice is testable and predictable.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

import type { GgufCatalogEntry } from "@/types/models";

/** Real machines report slightly under the nominal size ("16 GB" -> 15.9). */
const RAM_TOLERANCE_GB = 0.75;

export function recommendGguf(
  catalog: GgufCatalogEntry[],
  totalRamGb: number | undefined,
): GgufCatalogEntry | null {
  if (catalog.length === 0) return null;
  if (!totalRamGb || totalRamGb <= 0) {
    /* No hardware reading: recommend the dependable small default rather
       than nothing. */
    return catalog.find((e) => e.id === "llama-3.2-3b") ?? catalog[0];
  }

  const ram = totalRamGb + RAM_TOLERANCE_GB;
  const comfortable = catalog.filter((e) => e.recommended_ram_gb <= ram);
  if (comfortable.length > 0) return comfortable[comfortable.length - 1];

  const possible = catalog.filter((e) => e.min_ram_gb <= ram);
  if (possible.length > 0) return possible[possible.length - 1];

  return catalog[0];
}
