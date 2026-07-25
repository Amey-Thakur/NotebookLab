/*
 * Name: gguf-recommend.ts
 * Purpose: Pick the bundled model this computer should start with.
 * Description: The bundled server runs on the CPU, so model size drives
 *   responsiveness far more than a RAM fit does: a large model that fits memory
 *   still answers too slowly (and a reasoning model spends minutes "thinking")
 *   to be a good first run. So the automatic pick is the strongest model that
 *   both fits comfortably and stays in a responsive size range; the user can
 *   always choose a larger one by hand. When nothing responsive fits, fall back
 *   to the largest comfortable model, then the largest that meets its minimum,
 *   then the smallest entry. Kept a pure function so the choice is testable.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-23
 */

import type { GgufCatalogEntry } from "@/types/models";

/** Real machines report slightly under the nominal size ("16 GB" -> 15.9). */
const RAM_TOLERANCE_GB = 0.75;

/** Above this parameter count, CPU generation is too slow to recommend as a
    first run. 7B+ (and reasoning models) stay available to pick by hand. */
const RESPONSIVE_MAX_PARAMS_B = 5;

/** Parse the human "params" string ("3B", "3.8B") to a number of billions.
    Unparseable values sort as huge so they never win the responsive pick. */
function paramsInB(entry: GgufCatalogEntry): number {
  const n = parseFloat(entry.params);
  return Number.isFinite(n) ? n : Infinity;
}

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

  /* Prefer the strongest model that both fits comfortably and stays responsive
     on CPU: the largest one within the responsive size range. */
  const responsive = comfortable.filter((e) => paramsInB(e) <= RESPONSIVE_MAX_PARAMS_B);
  if (responsive.length > 0) {
    return responsive.reduce((best, e) => (paramsInB(e) > paramsInB(best) ? e : best));
  }

  /* Nothing responsive fits comfortably: the largest comfortable model, then
     the largest that at least meets its minimum, then the smallest entry. */
  if (comfortable.length > 0) return comfortable[comfortable.length - 1];

  const possible = catalog.filter((e) => e.min_ram_gb <= ram);
  if (possible.length > 0) return possible[possible.length - 1];

  return catalog[0];
}
