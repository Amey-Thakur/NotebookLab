/*
 * Name: idea-space-view.tsx
 * Purpose: Show an argument as a space you can turn, rather than an outline.
 * Description: The Thinking Partner used to draw the Studio's mind map from the
 *   Studio's prompt, so both features produced the same picture from the same
 *   sources and one of them had no reason to exist.
 *
 *   A mind map is a hierarchy: it answers what a body of work contains. This
 *   answers a different question, and so it is not a tree. Claims, evidence,
 *   tensions and open questions sit in one space, positioned by force rather
 *   than by rank, and the edges say how they stand to each other: supporting,
 *   contradicting, depending, raising. A contradiction is the thing worth
 *   seeing, and a hierarchy structurally cannot show one, because it has no way
 *   to draw two things pulling against each other.
 *
 *   The layout runs a small force simulation and projects it with perspective.
 *   The cloud turns slowly on its own so depth reads at a glance; drag to turn
 *   it yourself. Same approach as the notes graph, no libraries.
 * Tech Stack: React 19, Canvas 2D
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-29
 */

import { useEffect, useRef, useState } from "react";

export type IdeaKind = "claim" | "evidence" | "tension" | "question";
export type IdeaRelation = "supports" | "contradicts" | "depends" | "raises";

export interface IdeaNode {
  id: string;
  label: string;
  kind: IdeaKind;
  weight?: number;
}

export interface IdeaEdge {
  from: string;
  to: string;
  relation: IdeaRelation;
}

export interface IdeaSpace {
  title?: string;
  nodes: IdeaNode[];
  edges: IdeaEdge[];
}

const HEIGHT = 460;
const PERSPECTIVE = 620;
/** Slow enough to read while it moves, fast enough to reveal depth. */
const SPIN_PER_FRAME = 0.0022;

interface Placed extends IdeaNode {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  degree: number;
}

/** Read a CSS custom property so the drawing follows the app's theme. */
function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Colour carries the kind, because that is the thing to see at a glance. */
function kindColor(kind: IdeaKind): { fill: string; label: string } {
  switch (kind) {
    case "tension":
      return { fill: themeColor("--color-error", "#e06c6c"), label: "Tension" };
    case "question":
      return { fill: themeColor("--color-accent", "#8ab2ea"), label: "Open question" };
    case "evidence":
      return { fill: themeColor("--color-ok", "#6cae75"), label: "Evidence" };
    default:
      return { fill: themeColor("--color-text-2", "#c9c4bc"), label: "Claim" };
  }
}

export function IdeaSpaceView({ data }: { data: IdeaSpace }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [focused, setFocused] = useState<IdeaNode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const valid = new Set(data.nodes.map((n) => n.id));
    /* Edges naming a node that does not exist are dropped rather than trusted:
       a model occasionally invents an id, and drawing to nowhere throws. */
    const edges = data.edges.filter((e) => valid.has(e.from) && valid.has(e.to) && e.from !== e.to);

    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }

    /* Start on a sphere so the simulation has no preferred direction. A grid or
       a ring would leave its own shape visible in the final layout. */
    const count = data.nodes.length;
    const radius = 150;
    const nodes: Placed[] = data.nodes.map((n, i) => {
      const t = (i + 0.5) / count;
      const inclination = Math.acos(1 - 2 * t);
      const azimuth = Math.PI * (1 + Math.sqrt(5)) * i;
      return {
        ...n,
        x: radius * Math.sin(inclination) * Math.cos(azimuth),
        y: radius * Math.sin(inclination) * Math.sin(azimuth),
        z: radius * Math.cos(inclination),
        vx: 0,
        vy: 0,
        vz: 0,
        degree: degree.get(n.id) ?? 0,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));

    const state = { yaw: 0.5, pitch: -0.25, dragging: false, lastX: 0, lastY: 0 };

    const settle = () => {
      /* Repel everything, pull connected pairs together, and hold the whole
         thing near the origin so it cannot drift out of frame. */
      for (const a of nodes) {
        for (const b of nodes) {
          if (a === b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dz = a.z - b.z;
          const distSq = dx * dx + dy * dy + dz * dz || 1;
          const push = 900 / distSq;
          a.vx += dx * push;
          a.vy += dy * push;
          a.vz += dz * push;
        }
      }
      for (const e of edges) {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) continue;
        /* A contradiction is held further apart than a support: the distance is
           part of what the picture says. */
        const rest = e.relation === "contradicts" ? 190 : 110;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const pull = (dist - rest) * 0.0016;
        a.vx += dx * pull;
        a.vy += dy * pull;
        a.vz += dz * pull;
        b.vx -= dx * pull;
        b.vy -= dy * pull;
        b.vz -= dz * pull;
      }
      for (const n of nodes) {
        n.vx -= n.x * 0.0022;
        n.vy -= n.y * 0.0022;
        n.vz -= n.z * 0.0022;
        n.x += n.vx;
        n.y += n.vy;
        n.z += n.vz;
        n.vx *= 0.86;
        n.vy *= 0.86;
        n.vz *= 0.86;
      }
    };

    /* Settle before the first paint so it does not visibly explode outwards. */
    for (let i = 0; i < 140; i += 1) settle();

    let frame = 0;
    let pointerX = -1;
    let pointerY = -1;

    const draw = () => {
      const width = canvas.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== HEIGHT * dpr) {
        canvas.width = width * dpr;
        canvas.height = HEIGHT * dpr;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, HEIGHT);

      if (!state.dragging) state.yaw += SPIN_PER_FRAME;
      settle();

      const cosY = Math.cos(state.yaw);
      const sinY = Math.sin(state.yaw);
      const cosP = Math.cos(state.pitch);
      const sinP = Math.sin(state.pitch);
      const centerX = width / 2;
      const centerY = HEIGHT / 2;

      const project = (n: Placed) => {
        const x1 = n.x * cosY + n.z * sinY;
        const z1 = -n.x * sinY + n.z * cosY;
        const y2 = n.y * cosP - z1 * sinP;
        const z2 = n.y * sinP + z1 * cosP;
        const scale = PERSPECTIVE / (PERSPECTIVE + z2);
        return { sx: centerX + x1 * scale, sy: centerY + y2 * scale, depth: z2, scale };
      };

      const projected = new Map(nodes.map((n) => [n.id, { node: n, p: project(n) }]));
      const rule = themeColor("--color-border-hover", "#3a3a3a");

      for (const e of edges) {
        const a = projected.get(e.from);
        const b = projected.get(e.to);
        if (!a || !b) continue;
        const fade = Math.max(0.12, 1 - (a.p.depth + b.p.depth) / (radius * 5));
        context.globalAlpha = fade * 0.85;
        /* A contradiction is drawn dashed and in the warning colour, so the
           thing most worth noticing is the thing that stands out. */
        if (e.relation === "contradicts") {
          context.strokeStyle = themeColor("--color-error", "#e06c6c");
          context.setLineDash([4, 4]);
          context.lineWidth = 1.4;
        } else if (e.relation === "raises") {
          context.strokeStyle = themeColor("--color-accent-dim", "#5f8ed6");
          context.setLineDash([1, 3]);
          context.lineWidth = 1;
        } else {
          context.strokeStyle = rule;
          context.setLineDash([]);
          context.lineWidth = 1;
        }
        context.beginPath();
        context.moveTo(a.p.sx, a.p.sy);
        context.lineTo(b.p.sx, b.p.sy);
        context.stroke();
      }
      context.setLineDash([]);
      context.globalAlpha = 1;

      /* Back to front, so nearer nodes paint over further ones. */
      const ordered = [...projected.values()].sort((x, y) => y.p.depth - x.p.depth);
      let hovered: { node: IdeaNode; sx: number; sy: number; r: number } | null = null;

      for (const { node, p } of ordered) {
        const weight = Math.min(3, Math.max(1, node.weight ?? 1));
        const r = (5 + weight * 2.4 + Math.min(node.degree, 5)) * p.scale;
        const near = Math.max(0.28, 1 - p.depth / (radius * 2.6));
        const isHover =
          pointerX >= 0 && (pointerX - p.sx) ** 2 + (pointerY - p.sy) ** 2 <= (r + 5) ** 2;
        if (isHover) hovered = { node, sx: p.sx, sy: p.sy, r };

        const { fill } = kindColor(node.kind);
        context.globalAlpha = near;
        context.fillStyle = fill;
        context.beginPath();
        /* Questions are drawn hollow: they are the holes in the argument. */
        context.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        if (node.kind === "question") {
          context.strokeStyle = fill;
          context.lineWidth = 1.6;
          context.stroke();
        } else {
          context.fill();
        }
      }
      context.globalAlpha = 1;

      if (hovered) {
        const label = hovered.node.label;
        context.font = "12px ui-sans-serif, system-ui, sans-serif";
        const w = context.measureText(label).width + 16;
        const x = Math.min(Math.max(hovered.sx - w / 2, 4), width - w - 4);
        const y = hovered.sy - hovered.r - 26;
        context.fillStyle = themeColor("--color-surface", "#161616");
        context.strokeStyle = themeColor("--color-border", "#2a2a2a");
        context.lineWidth = 1;
        context.beginPath();
        context.rect(x, y, w, 20);
        context.fill();
        context.stroke();
        context.fillStyle = themeColor("--color-text-1", "#eae6e0");
        context.fillText(label, x + 8, y + 14);
      }

      frame = requestAnimationFrame(draw);
    };

    const hit = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = clientX - rect.left;
      pointerY = clientY - rect.top;
    };

    const onMove = (e: PointerEvent) => {
      hit(e.clientX, e.clientY);
      if (!state.dragging) return;
      state.yaw += (e.clientX - state.lastX) * 0.006;
      state.pitch += (e.clientY - state.lastY) * 0.006;
      state.pitch = Math.max(-1.2, Math.min(1.2, state.pitch));
      state.lastX = e.clientX;
      state.lastY = e.clientY;
    };
    const onDown = (e: PointerEvent) => {
      state.dragging = true;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      state.dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const onLeave = () => {
      pointerX = -1;
      pointerY = -1;
    };
    const onClick = (e: MouseEvent) => {
      hit(e.clientX, e.clientY);
      /* Reuse the same hit test the hover uses by reading the last projection
         on the next frame; simplest is to find the nearest node in screen space
         at click time. */
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      let best: { node: IdeaNode; d: number } | null = null;
      for (const n of nodes) {
        const x1 = n.x * Math.cos(state.yaw) + n.z * Math.sin(state.yaw);
        const z1 = -n.x * Math.sin(state.yaw) + n.z * Math.cos(state.yaw);
        const y2 = n.y * Math.cos(state.pitch) - z1 * Math.sin(state.pitch);
        const z2 = n.y * Math.sin(state.pitch) + z1 * Math.cos(state.pitch);
        const scale = PERSPECTIVE / (PERSPECTIVE + z2);
        const sx = canvas.clientWidth / 2 + x1 * scale;
        const sy = HEIGHT / 2 + y2 * scale;
        const d = (sx - cx) ** 2 + (sy - cy) ** 2;
        if (d < 400 && (!best || d < best.d)) best = { node: n, d };
      }
      setFocused(best?.node ?? null);
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
    };
  }, [data]);

  const kinds: IdeaKind[] = ["claim", "evidence", "tension", "question"];

  return (
    <div>
      {data.title && (
        <p className="mb-3 text-sm font-display font-bold text-text-1">{data.title}</p>
      )}

      <canvas
        ref={canvasRef}
        style={{ height: HEIGHT }}
        className="w-full cursor-grab active:cursor-grabbing border border-border bg-bg"
        aria-label="Idea space. Drag to turn it. Click an idea to read it."
      />

      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-text-3">
        {kinds.map((kind) => {
          const { fill, label } = kindColor(kind);
          return (
            <span key={kind} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={
                  kind === "question"
                    ? { border: `1.5px solid ${fill}` }
                    : { backgroundColor: fill }
                }
              />
              {label}
            </span>
          );
        })}
        <span className="ml-auto font-mono text-text-4">drag to turn</span>
      </div>

      {/* Reading the label off a turning canvas is hard, so a click parks it
          here where it stays still. */}
      {focused && (
        <div className="mt-3 p-3 border border-border bg-surface">
          <p className="text-xs font-mono uppercase tracking-widest text-text-4 mb-1">
            {kindColor(focused.kind).label}
          </p>
          <p className="text-sm text-text-1">{focused.label}</p>
        </div>
      )}

      {/* A space with no tension is worth saying out loud rather than leaving
          the user to notice an absence. */}
      {!data.nodes.some((n) => n.kind === "tension") && (
        <p className="mt-3 text-xs text-text-4">
          No tensions were found in these sources. That can mean the material agrees with
          itself, or that it is all from one point of view.
        </p>
      )}
    </div>
  );
}
