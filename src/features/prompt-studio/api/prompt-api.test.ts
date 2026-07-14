/*
 * Name: prompt-api.test.ts
 * Purpose: Tests for the prompt crafter's tolerant parser.
 * Description: Covers the envelope happy path, fenced and prose-wrapped JSON,
 *   mistyped fields, string variables, and the plain-text fallback, so a model
 *   that ignores the format can never lose the result or crash the page.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { describe, it, expect } from "vitest";

import { parseCrafted } from "./prompt-api";

describe("parseCrafted", () => {
  it("reads a full envelope", () => {
    const text = JSON.stringify({
      prompt: "You are a reviewer. Classify the review.",
      settings: { temperature: 0.1, top_p: 0.95, top_k: 30, max_tokens: 256 },
      variables: [{ name: "{review_text}", purpose: "the review to classify" }],
      notes: ["Few-shot fits classification."],
    });
    const parsed = parseCrafted(text);
    expect(parsed.prompt).toContain("Classify");
    expect(parsed.settings.temperature).toBe(0.1);
    expect(parsed.variables).toHaveLength(1);
    expect(parsed.variables[0].name).toBe("{review_text}");
    expect(parsed.notes).toHaveLength(1);
  });

  it("reads an envelope wrapped in a code fence with prose around it", () => {
    const text =
      'Here you go:\n```json\n{"prompt":"Summarize {document} in 5 bullets.","settings":{"temperature":0.2},"variables":["{document}"],"notes":[]}\n```\nEnjoy!';
    const parsed = parseCrafted(text);
    expect(parsed.prompt).toBe("Summarize {document} in 5 bullets.");
    expect(parsed.settings.temperature).toBe(0.2);
    /* String-form variables are accepted too. */
    expect(parsed.variables[0]).toEqual({ name: "{document}", purpose: "" });
  });

  it("falls back to the whole text when there is no usable JSON", () => {
    const parsed = parseCrafted("Act as a historian. Explain the causes of WW1 in 3 paragraphs.");
    expect(parsed.prompt).toContain("Act as a historian");
    expect(parsed.variables).toEqual([]);
    expect(parsed.notes).toEqual([]);
  });

  it("falls back when the envelope lacks a prompt, and tolerates mistyped fields", () => {
    const noPrompt = parseCrafted('{"settings":{"temperature":0.2}}');
    expect(noPrompt.prompt).toContain("temperature");

    const mistyped = parseCrafted(
      '{"prompt":"P","settings":"hot","variables":{"a":1},"notes":"n/a"}',
    );
    expect(mistyped.prompt).toBe("P");
    expect(mistyped.settings).toEqual({
      temperature: undefined,
      top_p: undefined,
      top_k: undefined,
      max_tokens: undefined,
    });
    expect(mistyped.variables).toEqual([]);
    expect(mistyped.notes).toEqual([]);
  });

  it("handles empty input", () => {
    expect(parseCrafted("  ").prompt).toBe("");
  });
});
