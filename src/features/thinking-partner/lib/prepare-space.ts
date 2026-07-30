/*
 * Name: prepare-space.ts
 * Purpose: Make a model's idea-space reply safe to draw.
 * Description: The renderer keys nodes by id and looks edges up by id, so
 *   anything malformed in the reply becomes a drawing bug rather than an error:
 *   a duplicate id collapses two ideas into one and silently loses a node, an
 *   edge naming an id that was never defined draws to nowhere, and a node
 *   pointing at itself makes the force simulation push against itself forever.
 *
 *   Models do produce all three. Cleaning the data here, where it can be tested,
 *   keeps the canvas code free of defensive checks and means a slightly wrong
 *   reply still draws something useful instead of nothing.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-30
 */

import type { IdeaEdge, IdeaKind, IdeaNode, IdeaSpace } from "../components/idea-space-view";

const KINDS: IdeaKind[] = ["claim", "evidence", "tension", "question"];

/** Upper bound on what stays readable on one canvas. */
const MAX_NODES = 24;

export interface PreparedSpace {
  title?: string;
  nodes: IdeaNode[];
  edges: IdeaEdge[];
  /** True when anything had to be dropped, so the page can say so. */
  repaired: boolean;
}

/** Clean a reply into something that can be drawn without special cases. */
export function prepareSpace(raw: Partial<IdeaSpace> | null | undefined): PreparedSpace {
  const incoming = Array.isArray(raw?.nodes) ? raw!.nodes : [];
  let repaired = false;

  const seen = new Set<string>();
  const nodes: IdeaNode[] = [];
  for (const node of incoming) {
    const id = typeof node?.id === "string" ? node.id.trim() : "";
    const label = typeof node?.label === "string" ? node.label.trim() : "";
    /* A node with no id cannot be referenced and a node with no label cannot be
       read, so neither is worth a place in the picture. */
    if (!id || !label || seen.has(id)) {
      repaired = repaired || Boolean(id || label);
      continue;
    }
    seen.add(id);
    nodes.push({
      id,
      label,
      kind: KINDS.includes(node.kind) ? node.kind : "claim",
      weight: clampWeight(node.weight),
    });
    if (nodes.length >= MAX_NODES) break;
  }
  if (incoming.length > nodes.length) repaired = true;

  const incomingEdges = Array.isArray(raw?.edges) ? raw!.edges : [];
  const edgeKeys = new Set<string>();
  const edges: IdeaEdge[] = [];
  for (const edge of incomingEdges) {
    const from = typeof edge?.from === "string" ? edge.from.trim() : "";
    const to = typeof edge?.to === "string" ? edge.to.trim() : "";
    if (!seen.has(from) || !seen.has(to) || from === to) continue;
    /* One line per pair per relation: a repeated edge just draws over itself
       while doubling the force pulling those two together. */
    const key = `${from}>${to}:${edge.relation}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({
      from,
      to,
      relation:
        edge.relation === "contradicts" ||
        edge.relation === "depends" ||
        edge.relation === "raises"
          ? edge.relation
          : "supports",
    });
  }
  if (incomingEdges.length > edges.length) repaired = true;

  return { title: raw?.title, nodes, edges, repaired };
}

function clampWeight(weight: unknown): number {
  const n = typeof weight === "number" && Number.isFinite(weight) ? weight : 1;
  return Math.min(3, Math.max(1, Math.round(n)));
}
