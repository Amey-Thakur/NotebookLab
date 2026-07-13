/*
 * Name: stroke.ts
 * Purpose: Turn a freehand point list into a smooth SVG path.
 * Description: Wraps perfect-freehand, which turns raw pointer samples into a
 *   natural, pressure-aware outline, then converts that outline into an SVG
 *   path string. Pure, so it needs no DOM.
 * Tech Stack: TypeScript, perfect-freehand
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { getStroke } from "perfect-freehand";

import type { StrokeElement } from "../types";

/** Build the filled SVG path for a stroke. */
export function strokeToPath(stroke: StrokeElement): string {
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
  });
  return outlineToPath(outline as number[][]);
}

/** The canonical perfect-freehand outline-to-SVG conversion. */
function outlineToPath(points: number[][]): string {
  if (points.length === 0) return "";

  const d = points.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", points[0][0], points[0][1], "Q"] as (string | number)[],
  );

  d.push("Z");
  return d.join(" ");
}
