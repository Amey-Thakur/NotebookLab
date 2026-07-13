/*
 * Name: mind-map-view.tsx
 * Purpose: Draw a mind map from the generated structure.
 * Description: Lays the central concept, its themes, and their sub-topics out
 *   as a real horizontal tree in SVG, with curved connectors between them. The
 *   layout is computed from the data so any shape fits, the whole thing scales
 *   fluidly to its container, and colors come from the theme tokens so it reads
 *   in light and dark alike. This replaces the earlier text-only placeholder.
 * Tech Stack: React 19, SVG, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import type { MindMap } from "../api/studio-api";

const PAD = 16;
const ROW_H = 46;
const COL_W = 215;
const NODE_W = 172;
const NODE_H = 30;

function clip(label: string, max = 26): string {
  const text = label.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function MindMapView({ data }: { data: MindMap }) {
  const branches = data.branches ?? [];
  if (branches.length === 0) {
    return <p className="text-sm text-text-3">The mind map came back empty. Try a broader focus.</p>;
  }

  /* Give every leaf a row, center each branch on its children, center the root
     on the branches. Row offsets are computed without mutation: each branch
     takes as many rows as it has children (at least one). */
  const rowCounts = branches.map((branch) => Math.max(branch.children?.length ?? 0, 1));
  const rowOffsets = rowCounts.map((_, i) => rowCounts.slice(0, i).reduce((sum, n) => sum + n, 0));
  const rowY = (index: number) => PAD + index * ROW_H + ROW_H / 2;

  const laid = branches.map((branch, i) => {
    const kids = branch.children ?? [];
    const base = rowOffsets[i];
    if (kids.length === 0) {
      return { label: branch.label, cy: rowY(base), children: [] as { label: string; cy: number }[] };
    }
    const children = kids.map((kid, k) => ({ label: kid.label, cy: rowY(base + k) }));
    const cy = (children[0].cy + children[children.length - 1].cy) / 2;
    return { label: branch.label, cy, children };
  });

  const totalRows = Math.max(
    rowCounts.reduce((sum, n) => sum + n, 0),
    1,
  );
  const height = PAD * 2 + totalRows * ROW_H;
  const rootCy = (laid[0].cy + laid[laid.length - 1].cy) / 2;
  const width = PAD * 2 + COL_W * 2 + NODE_W;

  const rootRight = PAD + NODE_W;
  const branchX = PAD + COL_W;
  const branchRight = branchX + NODE_W;
  const childX = PAD + COL_W * 2;

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto min-w-[640px]"
        role="img"
        aria-label={`Mind map: ${data.title}`}
      >
        {/* Connectors first so nodes sit on top */}
        <g fill="none" stroke="var(--color-border-hover)" strokeWidth="1.5">
          {laid.map((branch, b) => (
            <g key={b}>
              <path d={curve(rootRight, rootCy, branchX, branch.cy)} />
              {branch.children.map((child, c) => (
                <path key={c} d={curve(branchRight, branch.cy, childX, child.cy)} />
              ))}
            </g>
          ))}
        </g>

        {/* Root */}
        <Node x={PAD} cy={rootCy} label={clip(data.title, 24)} kind="root" />

        {/* Branches and children */}
        {laid.map((branch, b) => (
          <g key={b}>
            <Node x={branchX} cy={branch.cy} label={clip(branch.label)} kind="branch" />
            {branch.children.map((child, c) => (
              <Node key={c} x={childX} cy={child.cy} label={clip(child.label)} kind="child" />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

function Node({
  x,
  cy,
  label,
  kind,
}: {
  x: number;
  cy: number;
  label: string;
  kind: "root" | "branch" | "child";
}) {
  const y = cy - NODE_H / 2;
  const fill =
    kind === "root"
      ? "var(--color-primary)"
      : kind === "branch"
        ? "var(--color-surface-2)"
        : "var(--color-surface)";
  const stroke = kind === "root" ? "var(--color-primary)" : "var(--color-accent-dim)";
  const textColor =
    kind === "root"
      ? "var(--color-on-primary)"
      : kind === "branch"
        ? "var(--color-text-1)"
        : "var(--color-text-2)";

  return (
    <g>
      <rect x={x} y={y} width={NODE_W} height={NODE_H} fill={fill} stroke={stroke} strokeWidth="1" />
      <text
        x={x + NODE_W / 2}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="12.5"
        style={{ fill: textColor, fontFamily: '"Play", sans-serif' }}
      >
        {label}
      </text>
    </g>
  );
}
