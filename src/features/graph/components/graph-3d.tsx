/*
 * Name: graph-3d.tsx
 * Purpose: A three-dimensional view of how a notebook's notes connect.
 * Description: Our own tiny 3D engine, no libraries: notes are laid out by a
 *   force simulation in three dimensions (springs along links, repulsion
 *   between all nodes, gentle centering), then projected onto the canvas with
 *   simple perspective. The cloud slowly turns so depth reads at a glance;
 *   drag to rotate it yourself, scroll to zoom, click a note to open it.
 *   Hubs grow with their connections, nearer notes draw larger and brighter.
 *   Colors are read from the live theme variables so both themes look native.
 *   Under reduced motion the idle spin stands still (interaction still
 *   renders); the simulation pre-settles synchronously at mount so the shape
 *   is stable from the first frame. Screen readers get the page's parallel
 *   "Most connected" list; the canvas itself is a labeled image.
 * Tech Stack: React 19, Canvas 2D
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

import { useEffect, useRef } from "react";

import type { NotesGraph } from "@/types/models";

interface Graph3DProps {
  graph: NotesGraph;
  onOpenNote: (id: string) => void;
}

interface Node3D {
  id: string;
  title: string;
  degree: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

const HEIGHT = 520;
const PERSPECTIVE = 640;
const SETTLE_ITERATIONS = 160;

export function Graph3D({ graph, onOpenNote }: Graph3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* Interaction state lives in refs: the render loop reads it every frame
     without React re-renders. */
  const stateRef = useRef({
    yaw: 0.6,
    pitch: 0.25,
    zoom: 1,
    autoSpin: true,
    dragging: false,
    lastX: 0,
    lastY: 0,
    downX: 0,
    downY: 0,
    hovered: null as string | null,
    pointerX: -1,
    pointerY: -1,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = stateRef.current;
    state.autoSpin = !reducedMotion;

    /* Seed nodes on a sphere, deterministically by index (golden-angle
       spiral), so the same notebook always opens with the same shape. */
    const count = graph.nodes.length;
    const radius = Math.min(200, 90 + count * 4);
    const nodes: Node3D[] = graph.nodes.map((n, i) => {
      const t = count > 1 ? i / (count - 1) : 0.5;
      const inclination = Math.acos(1 - 2 * t);
      const azimuth = 2.399963 * i; /* golden angle */
      return {
        id: n.id,
        title: n.title,
        degree: n.degree,
        x: radius * Math.sin(inclination) * Math.cos(azimuth),
        y: radius * Math.sin(inclination) * Math.sin(azimuth),
        z: radius * Math.cos(inclination),
        vx: 0,
        vy: 0,
        vz: 0,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges = graph.edges
      .map((e) => ({ a: byId.get(e.source), b: byId.get(e.target) }))
      .filter((e): e is { a: Node3D; b: Node3D } => !!e.a && !!e.b);

    /* One simulation step: spring links, repel everything, drift to center. */
    const step = () => {
      for (const { a, b } of edges) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const force = (dist - 110) * 0.004;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;
        a.vx += fx;
        a.vy += fy;
        a.vz += fz;
        b.vx -= fx;
        b.vy -= fy;
        b.vz -= fz;
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dz = b.z - a.z;
          const distSq = dx * dx + dy * dy + dz * dz || 1;
          const force = Math.min(1200 / distSq, 2);
          const dist = Math.sqrt(distSq);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const fz = (dz / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          a.vz -= fz;
          b.vx += fx;
          b.vy += fy;
          b.vz += fz;
        }
      }
      for (const n of nodes) {
        n.vx -= n.x * 0.002;
        n.vy -= n.y * 0.002;
        n.vz -= n.z * 0.002;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.vz *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
        n.z += n.vz;
      }
    };
    for (let i = 0; i < SETTLE_ITERATIONS; i++) step();

    /* Colors from the live theme, refreshed on each draw so a theme toggle
       repaints correctly without a remount. */
    const themeColor = (name: string, fallback: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

    const draw = () => {
      const width = canvas.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== HEIGHT * dpr) {
        canvas.width = width * dpr;
        canvas.height = HEIGHT * dpr;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, HEIGHT);

      const accent = themeColor("--color-accent", "#8ab2ea");
      const dim = themeColor("--color-accent-dim", "#5f8ed6");
      const line = themeColor("--color-border-hover", "#3a3a3a");
      const text = themeColor("--color-text-1", "#eae6e0");
      const surface = themeColor("--color-surface", "#161616");

      const cosY = Math.cos(state.yaw);
      const sinY = Math.sin(state.yaw);
      const cosP = Math.cos(state.pitch);
      const sinP = Math.sin(state.pitch);
      const centerX = width / 2;
      const centerY = HEIGHT / 2;

      const project = (n: Node3D) => {
        /* Yaw around Y, then pitch around X, then perspective. */
        const x1 = n.x * cosY + n.z * sinY;
        const z1 = -n.x * sinY + n.z * cosY;
        const y2 = n.y * cosP - z1 * sinP;
        const z2 = n.y * sinP + z1 * cosP;
        const scale = (PERSPECTIVE / (PERSPECTIVE + z2)) * state.zoom;
        return { sx: centerX + x1 * scale, sy: centerY + y2 * scale, depth: z2, scale };
      };

      const projected = new Map(nodes.map((n) => [n.id, { node: n, p: project(n) }]));

      /* Edges first, faded with depth. */
      for (const { a, b } of edges) {
        const pa = projected.get(a.id)?.p;
        const pb = projected.get(b.id)?.p;
        if (!pa || !pb) continue;
        const depthFade = Math.max(0.15, 1 - (pa.depth + pb.depth) / (radius * 5));
        context.strokeStyle = line;
        context.globalAlpha = depthFade * 0.8;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(pa.sx, pa.sy);
        context.lineTo(pb.sx, pb.sy);
        context.stroke();
      }
      context.globalAlpha = 1;

      /* Nodes back-to-front so nearer ones paint over. */
      const ordered = [...projected.values()].sort((a, b) => b.p.depth - a.p.depth);
      let hovered: { id: string; sx: number; sy: number; r: number; title: string } | null = null;
      for (const { node, p } of ordered) {
        const r = (3 + Math.min(node.degree, 6) * 1.6) * p.scale;
        const near = Math.max(0.25, 1 - p.depth / (radius * 2.5));
        const isHover =
          state.pointerX >= 0 &&
          (state.pointerX - p.sx) ** 2 + (state.pointerY - p.sy) ** 2 <= (r + 4) ** 2;
        if (isHover) hovered = { id: node.id, sx: p.sx, sy: p.sy, r, title: node.title };

        context.globalAlpha = near;
        context.fillStyle = node.degree > 0 ? dim : line;
        context.beginPath();
        context.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        context.fill();
        if (node.degree > 2 || isHover) {
          context.strokeStyle = accent;
          context.lineWidth = isHover ? 1.8 : 1;
          context.stroke();
        }
      }
      context.globalAlpha = 1;

      /* Hover label, drawn last on a small plate so it stays readable. */
      state.hovered = hovered?.id ?? null;
      if (hovered) {
        const label =
          hovered.title.length > 42 ? `${hovered.title.slice(0, 41)}…` : hovered.title;
        context.font = "11px ui-monospace, monospace";
        const w = context.measureText(label).width + 12;
        const lx = Math.min(Math.max(hovered.sx - w / 2, 4), width - w - 4);
        const ly = Math.max(hovered.sy - hovered.r - 26, 4);
        context.fillStyle = surface;
        context.strokeStyle = accent;
        context.lineWidth = 1;
        context.fillRect(lx, ly, w, 18);
        context.strokeRect(lx, ly, w, 18);
        context.fillStyle = text;
        context.fillText(label, lx + 6, ly + 13);
      }
      canvas.style.cursor = hovered ? "pointer" : state.dragging ? "grabbing" : "grab";
    };

    let frame = 0;
    const loop = () => {
      if (state.autoSpin && !state.dragging) state.yaw += 0.0028;
      draw();
      frame = requestAnimationFrame(loop);
    };
    if (state.autoSpin) {
      frame = requestAnimationFrame(loop);
    } else {
      draw();
    }

    /* Interactions. Pointer events cover mouse, pen, and touch alike. */
    const onPointerDown = (e: PointerEvent) => {
      state.dragging = true;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.downX = e.clientX;
      state.downY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      state.pointerX = e.clientX - rect.left;
      state.pointerY = e.clientY - rect.top;
      if (state.dragging) {
        state.yaw += (e.clientX - state.lastX) * 0.005;
        state.pitch = Math.min(
          1.4,
          Math.max(-1.4, state.pitch + (e.clientY - state.lastY) * 0.005),
        );
        state.lastX = e.clientX;
        state.lastY = e.clientY;
      }
      if (!state.autoSpin) draw();
    };
    const onPointerUp = (e: PointerEvent) => {
      /* A click is a press that barely moved from where it started; anything
         further was a rotation and must not open a note. */
      if (
        state.dragging &&
        Math.abs(e.clientX - state.downX) < 4 &&
        Math.abs(e.clientY - state.downY) < 4 &&
        state.hovered
      ) {
        onOpenNote(state.hovered);
      }
      state.dragging = false;
      if (!state.autoSpin) draw();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      state.zoom = Math.min(2.5, Math.max(0.45, state.zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
      if (!state.autoSpin) draw();
    };
    const onLeave = () => {
      state.pointerX = -1;
      state.pointerY = -1;
      if (!state.autoSpin) draw();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [graph, onOpenNote]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full block touch-none"
      style={{ height: HEIGHT }}
      role="img"
      aria-label={`3D connection map of ${graph.nodes.length} notes and ${graph.edges.length} links. Drag to rotate, scroll to zoom, click a note to open it. The Most connected list beside the map carries the same information.`}
    />
  );
}
