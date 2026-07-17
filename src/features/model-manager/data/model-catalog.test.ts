/*
 * Name: model-catalog.test.ts
 * Purpose: Sanity checks for the curated catalog and the hardware-fit logic.
 * Description: The catalog is hand-maintained data, so these tests guard the
 *   invariants the UI relies on: unique tags in Ollama's format, coherent RAM
 *   figures, and non-empty descriptions. classifyFit decides install warnings,
 *   so its boundaries (including the nominal-RAM tolerance) are pinned down.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

import { describe, expect, it } from "vitest";

import { classifyFit, MODEL_CATALOG, USE_CASES } from "./model-catalog";
import { CLOUD_PROVIDERS } from "./cloud-providers";

describe("model catalog data", () => {
  it("has unique, well-formed Ollama tags", () => {
    const tags = MODEL_CATALOG.map((m) => m.tag);
    expect(new Set(tags).size).toBe(tags.length);
    for (const tag of tags) {
      expect(tag).toMatch(/^[a-z0-9._/-]+(:[a-z0-9._-]+)?$/i);
    }
  });

  it("keeps RAM figures coherent", () => {
    for (const model of MODEL_CATALOG) {
      expect(model.minRamGb).toBeGreaterThan(0);
      expect(model.recommendedRamGb).toBeGreaterThanOrEqual(model.minRamGb);
      expect(model.downloadGb).toBeGreaterThan(0);
      /* A quantized model always downloads smaller than the RAM it needs. */
      expect(model.downloadGb).toBeLessThanOrEqual(model.minRamGb);
    }
  });

  it("gives every model a blurb, rating, and known use cases", () => {
    for (const model of MODEL_CATALOG) {
      expect(model.blurb.length).toBeGreaterThan(10);
      expect(model.rating).toBeGreaterThanOrEqual(1);
      expect(model.rating).toBeLessThanOrEqual(5);
      expect(model.useCases.length).toBeGreaterThan(0);
      for (const useCase of model.useCases) {
        expect(USE_CASES).toContain(useCase);
      }
    }
  });
});

describe("classifyFit", () => {
  const model = MODEL_CATALOG.find((m) => m.tag === "gemma3:12b")!; /* min 16, rec 32 */

  it("is unknown without hardware data", () => {
    expect(classifyFit(model, undefined)).toBe("unknown");
    expect(classifyFit(model, 0)).toBe("unknown");
  });

  it("classifies below minimum as too large", () => {
    expect(classifyFit(model, 8)).toBe("too-large");
  });

  it("classifies between minimum and recommended as tight", () => {
    expect(classifyFit(model, 16)).toBe("tight");
  });

  it("classifies at or above recommended as fits", () => {
    expect(classifyFit(model, 32)).toBe("fits");
  });

  it("tolerates real machines reporting just under the nominal size", () => {
    /* A "16 GB" machine reports ~15.9 GB; it must not be told 16 GB models
       are too large. */
    expect(classifyFit(model, 15.9)).toBe("tight");
  });
});

describe("cloud provider registry", () => {
  it("uses https for every endpoint and key page", () => {
    for (const def of CLOUD_PROVIDERS) {
      expect(def.baseUrl).toMatch(/^https:\/\//);
      expect(def.keyUrl).toMatch(/^https:\/\//);
    }
  });

  it("has unique kinds and at least one model suggestion each", () => {
    const kinds = CLOUD_PROVIDERS.map((d) => d.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const def of CLOUD_PROVIDERS) {
      expect(def.models.length).toBeGreaterThan(0);
      for (const model of def.models) {
        expect(model.id.length).toBeGreaterThan(0);
      }
    }
  });
});
