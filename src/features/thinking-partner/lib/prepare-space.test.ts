/*
 * Name: prepare-space.test.ts
 * Purpose: Pin the cleaning that stands between a model's reply and the canvas.
 * Description: Every case here is something a model actually emits. Each one
 *   used to become a silent drawing fault rather than an error, which is the
 *   worst kind: the picture looks finished and is quietly missing an idea.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-30
 */

import { describe, expect, it } from "vitest";

import { prepareSpace } from "./prepare-space";

describe("prepareSpace", () => {
  it("keeps a well-formed space untouched", () => {
    const out = prepareSpace({
      title: "The question",
      nodes: [
        { id: "a", label: "A claim", kind: "claim", weight: 2 },
        { id: "b", label: "Some evidence", kind: "evidence", weight: 1 },
      ],
      edges: [{ from: "b", to: "a", relation: "supports" }],
    });
    expect(out.nodes).toHaveLength(2);
    expect(out.edges).toHaveLength(1);
    expect(out.repaired).toBe(false);
    expect(out.title).toBe("The question");
  });

  it("drops a duplicate id instead of losing a node to it", () => {
    /* The renderer keys nodes by id, so a duplicate collapsed two ideas into
       one and one of them silently vanished from the picture. */
    const out = prepareSpace({
      nodes: [
        { id: "a", label: "First", kind: "claim" },
        { id: "a", label: "Second", kind: "tension" },
      ],
      edges: [],
    });
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0].label).toBe("First");
    expect(out.repaired).toBe(true);
  });

  it("drops edges naming an id that does not exist", () => {
    const out = prepareSpace({
      nodes: [{ id: "a", label: "Only node", kind: "claim" }],
      edges: [
        { from: "a", to: "ghost", relation: "supports" },
        { from: "nowhere", to: "a", relation: "contradicts" },
      ],
    });
    expect(out.edges).toEqual([]);
    expect(out.repaired).toBe(true);
  });

  it("drops an edge from a node to itself", () => {
    /* A self-edge makes the force simulation push a node against itself. */
    const out = prepareSpace({
      nodes: [{ id: "a", label: "A claim", kind: "claim" }],
      edges: [{ from: "a", to: "a", relation: "supports" }],
    });
    expect(out.edges).toEqual([]);
  });

  it("collapses a repeated edge", () => {
    /* Drawn twice over itself, but pulling twice as hard in the layout. */
    const out = prepareSpace({
      nodes: [
        { id: "a", label: "One", kind: "claim" },
        { id: "b", label: "Two", kind: "claim" },
      ],
      edges: [
        { from: "a", to: "b", relation: "supports" },
        { from: "a", to: "b", relation: "supports" },
      ],
    });
    expect(out.edges).toHaveLength(1);
  });

  it("falls back to sensible values for an unknown kind or relation", () => {
    const out = prepareSpace({
      nodes: [{ id: "a", label: "Odd", kind: "assertion" as never }],
      edges: [{ from: "a", to: "a", relation: "implies" as never }],
    });
    expect(out.nodes[0].kind).toBe("claim");
  });

  it("clamps weight into the range the renderer sizes against", () => {
    const out = prepareSpace({
      nodes: [
        { id: "a", label: "Huge", kind: "claim", weight: 99 },
        { id: "b", label: "Tiny", kind: "claim", weight: -5 },
        { id: "c", label: "Missing", kind: "claim" },
        { id: "d", label: "Broken", kind: "claim", weight: Number.NaN },
      ],
      edges: [],
    });
    expect(out.nodes.map((n) => n.weight)).toEqual([3, 1, 1, 1]);
  });

  it("skips nodes with no id or no label", () => {
    const out = prepareSpace({
      nodes: [
        { id: "", label: "No id", kind: "claim" },
        { id: "b", label: "   ", kind: "claim" },
        { id: "c", label: "Fine", kind: "claim" },
      ],
      edges: [],
    });
    expect(out.nodes.map((n) => n.id)).toEqual(["c"]);
    expect(out.repaired).toBe(true);
  });

  it("caps how many nodes reach the canvas", () => {
    const out = prepareSpace({
      nodes: Array.from({ length: 60 }, (_, i) => ({
        id: `n${i}`,
        label: `Idea ${i}`,
        kind: "claim" as const,
      })),
      edges: [],
    });
    expect(out.nodes.length).toBeLessThanOrEqual(24);
    expect(out.repaired).toBe(true);
  });

  it("survives missing, empty and malformed input", () => {
    expect(prepareSpace(null).nodes).toEqual([]);
    expect(prepareSpace(undefined).edges).toEqual([]);
    expect(prepareSpace({}).nodes).toEqual([]);
    expect(prepareSpace({ nodes: "not an array" as never }).nodes).toEqual([]);
  });
});
