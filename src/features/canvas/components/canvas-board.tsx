/*
 * Name: canvas-board.tsx
 * Purpose: The interactive canvas surface.
 * Description: An SVG board in screen space with a world-space group inside it.
 *   Handles every gesture: draw with the pen, drag out rectangles and ellipses,
 *   place and edit text, select and move elements, pan the empty space, and
 *   zoom toward the cursor. In-progress gestures live here as local state and
 *   commit one whole change to the parent on release, so undo steps stay clean.
 *   Images can be dropped straight onto the surface.
 * Tech Stack: React 19, SVG, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { memo, useEffect, useId, useRef, useState } from "react";

import type { Camera, CanvasElement, TextElement, Tool } from "../types";
import {
  elementBounds,
  hitTest,
  normalizeRect,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Point,
} from "../lib/geometry";
import { newId, translateElement } from "../lib/scene";
import { strokeToPath } from "../lib/stroke";

interface CanvasBoardProps {
  elements: CanvasElement[];
  camera: Camera;
  tool: Tool;
  color: string;
  strokeSize: number;
  selectedId: string | null;
  onCameraChange: (camera: Camera) => void;
  onSelect: (id: string | null) => void;
  onCommit: (elements: CanvasElement[]) => void;
  onToolChange: (tool: Tool) => void;
  onDropImage: (file: File, world: Point) => void;
}

type Gesture =
  | { kind: "none" }
  | { kind: "pan"; startScreen: Point; startCamera: Camera }
  | { kind: "draw" }
  | { kind: "shape"; startWorld: Point }
  | { kind: "drag"; id: string; startWorld: Point };

const GRID = 26;

export function CanvasBoard(props: CanvasBoardProps) {
  const { elements, camera, tool, selectedId, onCameraChange } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const patternId = useId();

  const gesture = useRef<Gesture>({ kind: "none" });
  const [draft, setDraft] = useState<CanvasElement | null>(null);
  const draftRef = useRef<CanvasElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  /* A newly placed text element, held here (not committed) until it is confirmed
     with a non-empty value, so empty placements never enter history or the save. */
  const [pendingText, setPendingText] = useState<TextElement | null>(null);

  const cameraRef = useRef(camera);
  useEffect(() => {
    cameraRef.current = camera;
  });

  const putDraft = (next: CanvasElement | null) => {
    draftRef.current = next;
    setDraft(next);
  };
  const putDrag = (next: { id: string; dx: number; dy: number } | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  /* Abandon the in-progress gesture without committing (a cancelled pointer, or
     the button released without a pointerup ever reaching us). */
  const cancelGesture = () => {
    gesture.current = { kind: "none" };
    putDraft(null);
    putDrag(null);
  };

  /* Wheel zoom needs a non-passive listener to keep the page from scrolling. */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      onCameraChange(zoomAt(cameraRef.current, e.clientX - rect.left, e.clientY - rect.top, factor));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onCameraChange]);

  const pointFromEvent = (e: React.PointerEvent): { screen: Point; world: Point; pressure: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return {
      screen,
      world: screenToWorld(screen.x, screen.y, cameraRef.current),
      pressure: e.pressure > 0 ? e.pressure : 0.5,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (editing) commitEditing();
    if (e.button !== 0 && e.button !== 1) return;
    const { screen, world, pressure } = pointFromEvent(e);
    svgRef.current?.setPointerCapture(e.pointerId);

    /* Middle mouse always pans, regardless of tool. */
    if (e.button === 1 || tool === "select") {
      const hit = e.button === 1 ? null : hitTest({ version: 1, camera, elements }, world.x, world.y);
      if (hit) {
        props.onSelect(hit.id);
        gesture.current = { kind: "drag", id: hit.id, startWorld: world };
        putDrag({ id: hit.id, dx: 0, dy: 0 });
      } else {
        props.onSelect(null);
        gesture.current = { kind: "pan", startScreen: screen, startCamera: camera };
      }
      return;
    }

    if (tool === "pen") {
      gesture.current = { kind: "draw" };
      putDraft({
        id: newId(),
        type: "stroke",
        points: [[world.x, world.y, pressure]],
        color: props.color,
        size: props.strokeSize,
      });
      return;
    }

    if (tool === "rectangle" || tool === "ellipse") {
      gesture.current = { kind: "shape", startWorld: world };
      putDraft({
        id: newId(),
        type: tool,
        x: world.x,
        y: world.y,
        w: 0,
        h: 0,
        color: props.color,
        fill: "none",
        strokeWidth: props.strokeSize,
      });
      return;
    }

    if (tool === "text") {
      const element: TextElement = {
        id: newId(),
        type: "text",
        x: world.x,
        y: world.y,
        text: "",
        color: props.color,
        fontSize: 20,
      };
      /* Held pending, not committed, until confirmed with text. */
      setPendingText(element);
      setEditing({ id: element.id, value: "" });
      props.onToolChange("select");
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g.kind === "none") return;
    /* No button held mid-gesture means the pointer was cancelled; drop it rather
    than letting a hovering pen keep extending the stroke. */
    if (e.buttons === 0) {
      cancelGesture();
      return;
    }
    const { screen, world, pressure } = pointFromEvent(e);

    if (g.kind === "pan") {
      props.onCameraChange({
        zoom: g.startCamera.zoom,
        x: g.startCamera.x + (screen.x - g.startScreen.x),
        y: g.startCamera.y + (screen.y - g.startScreen.y),
      });
      return;
    }
    if (g.kind === "draw") {
      const current = draftRef.current;
      if (current && current.type === "stroke") {
        putDraft({ ...current, points: [...current.points, [world.x, world.y, pressure]] });
      }
      return;
    }
    if (g.kind === "shape") {
      const current = draftRef.current;
      if (current && (current.type === "rectangle" || current.type === "ellipse")) {
        const r = normalizeRect(g.startWorld.x, g.startWorld.y, world.x, world.y);
        putDraft({ ...current, x: r.x, y: r.y, w: r.w, h: r.h });
      }
      return;
    }
    if (g.kind === "drag") {
      putDrag({ id: g.id, dx: world.x - g.startWorld.x, dy: world.y - g.startWorld.y });
    }
  };

  const handlePointerUp = () => {
    const g = gesture.current;
    gesture.current = { kind: "none" };

    if (g.kind === "draw") {
      const current = draftRef.current;
      if (current && current.type === "stroke" && current.points.length > 1) {
        props.onCommit([...elements, current]);
        props.onSelect(current.id);
      }
      putDraft(null);
    } else if (g.kind === "shape") {
      const current = draftRef.current;
      if (current && "w" in current && current.w > 3 && current.h > 3) {
        props.onCommit([...elements, current]);
        props.onSelect(current.id);
      }
      putDraft(null);
    } else if (g.kind === "drag") {
      const d = dragRef.current;
      if (d && (d.dx !== 0 || d.dy !== 0)) {
        props.onCommit(elements.map((el) => (el.id === d.id ? translateElement(el, d.dx, d.dy) : el)));
      }
      putDrag(null);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, cameraRef.current);
    const hit = hitTest({ version: 1, camera, elements }, world.x, world.y);
    if (hit && hit.type === "text") {
      props.onSelect(hit.id);
      setEditing({ id: hit.id, value: hit.text });
    }
  };

  const commitEditing = () => {
    const active = editing;
    if (!active) return;
    setEditing(null);
    const value = active.value.trim();

    /* A brand-new text element: commit once on a non-empty value, otherwise
    discard it entirely, so an empty placement leaves no trace. */
    if (pendingText && pendingText.id === active.id) {
      const created = pendingText;
      setPendingText(null);
      if (value.length > 0) {
        props.onCommit([...elements, { ...created, text: value }]);
        props.onSelect(created.id);
      }
      return;
    }

    /* Editing an existing text element: emptying it removes it. */
    if (value.length === 0) {
      props.onCommit(elements.filter((el) => el.id !== active.id));
      props.onSelect(null);
    } else {
      props.onCommit(
        elements.map((el) => (el.id === active.id && el.type === "text" ? { ...el, text: value } : el)),
      );
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    const rect = svgRef.current!.getBoundingClientRect();
    const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, camera);
    props.onDropImage(file, world);
  };

  /* Apply an in-progress drag to the moved element so it follows the pointer. */
  const rendered = elements.map((el) =>
    drag && drag.id === el.id ? translateElement(el, drag.dx, drag.dy) : el,
  );
  const selected = selectedId ? rendered.find((el) => el.id === selectedId) ?? null : null;
  const editingElement = editing
    ? pendingText && pendingText.id === editing.id
      ? pendingText
      : rendered.find((el) => el.id === editing.id) ?? null
    : null;

  const cursor =
    tool === "pen" || tool === "rectangle" || tool === "ellipse"
      ? "crosshair"
      : tool === "text"
        ? "text"
        : "default";

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-bg select-none"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        style={{ cursor, touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={cancelGesture}
        onDoubleClick={handleDoubleClick}
      >
        <defs>
          <pattern
            id={patternId}
            width={GRID * camera.zoom}
            height={GRID * camera.zoom}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${camera.x % (GRID * camera.zoom)} ${camera.y % (GRID * camera.zoom)})`}
          >
            <circle cx={1} cy={1} r={1} fill="var(--color-border)" />
          </pattern>
        </defs>
        <rect x={0} y={0} width="100%" height="100%" fill={`url(#${patternId})`} />

        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {rendered.map((el) => (
            <CanvasElementView key={el.id} element={el} />
          ))}
          {draft && <CanvasElementView element={draft} />}
          {selected && <SelectionOutline element={selected} zoom={camera.zoom} />}
        </g>
      </svg>

      {editing && editingElement && editingElement.type === "text" && (
        <textarea
          autoFocus
          value={editing.value}
          onChange={(e) => setEditing({ id: editing.id, value: e.target.value })}
          onBlur={commitEditing}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              commitEditing();
            }
          }}
          className="absolute z-10 resize-none overflow-hidden border border-accent bg-surface/95 p-0
                     leading-tight outline-none"
          style={{
            left: worldToScreen(editingElement.x, editingElement.y, camera).x,
            top: worldToScreen(editingElement.x, editingElement.y, camera).y,
            fontSize: editingElement.fontSize * camera.zoom,
            color: editingElement.color,
            fontFamily: '"Source Serif 4", serif',
            minWidth: 120 * camera.zoom,
          }}
        />
      )}

      <p className="pointer-events-none absolute bottom-3 left-3 font-mono text-2xs text-text-4">
        Scroll to zoom, drag empty space to pan
      </p>
    </div>
  );
}

/* Memoized so committed elements do not re-render (or re-run perfect-freehand)
   on every pointer sample while a stroke is being drawn or an element dragged.
   Element objects keep their identity across those updates, so memo bails out. */
const CanvasElementView = memo(function CanvasElementView({ element }: { element: CanvasElement }) {
  switch (element.type) {
    case "stroke":
      return <path d={strokeToPath(element)} fill={element.color} />;
    case "rectangle":
      return (
        <rect
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          rx={2}
          fill={element.fill === "none" ? "none" : element.fill}
          stroke={element.color}
          strokeWidth={element.strokeWidth}
        />
      );
    case "ellipse":
      return (
        <ellipse
          cx={element.x + element.w / 2}
          cy={element.y + element.h / 2}
          rx={element.w / 2}
          ry={element.h / 2}
          fill={element.fill === "none" ? "none" : element.fill}
          stroke={element.color}
          strokeWidth={element.strokeWidth}
        />
      );
    case "text": {
      const lines = element.text.split("\n");
      return (
        <text
          x={element.x}
          y={element.y + element.fontSize}
          fill={element.color}
          fontSize={element.fontSize}
          style={{ fontFamily: '"Source Serif 4", serif' }}
        >
          {lines.map((line, i) => (
            <tspan key={i} x={element.x} dy={i === 0 ? 0 : element.fontSize * 1.25}>
              {line || " "}
            </tspan>
          ))}
        </text>
      );
    }
    case "image":
      return (
        <image
          href={element.src}
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          preserveAspectRatio="none"
        />
      );
  }
});

function SelectionOutline({ element, zoom }: { element: CanvasElement; zoom: number }) {
  const b = elementBounds(element);
  const pad = 4 / zoom;
  return (
    <rect
      x={b.x - pad}
      y={b.y - pad}
      width={b.w + pad * 2}
      height={b.h + pad * 2}
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth={1.5 / zoom}
      strokeDasharray={`${6 / zoom} ${4 / zoom}`}
      pointerEvents="none"
    />
  );
}
