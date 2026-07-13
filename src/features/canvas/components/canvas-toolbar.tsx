/*
 * Name: canvas-toolbar.tsx
 * Purpose: The canvas tool bar.
 * Description: Tools (select, pen, shapes, text), a color palette, a stroke
 *   weight, image insert, delete, undo/redo, and zoom. A floating, grouped bar
 *   drawn entirely from the theme tokens so it reads in light and dark. Every
 *   control is a real button with an accessible label.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { useRef } from "react";

import { CANVAS_COLORS, type Tool } from "../types";

interface CanvasToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  color: string;
  onColorChange: (color: string) => void;
  strokeSize: number;
  onStrokeSizeChange: (size: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasSelection: boolean;
  onDelete: () => void;
  onAddImage: (file: File) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

const TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: "select", label: "Select and move", icon: <IconSelect /> },
  { tool: "pen", label: "Draw freehand", icon: <IconPen /> },
  { tool: "rectangle", label: "Rectangle", icon: <IconRect /> },
  { tool: "ellipse", label: "Ellipse", icon: <IconEllipse /> },
  { tool: "text", label: "Text", icon: <IconText /> },
];

const SIZES = [
  { size: 3, label: "Thin" },
  { size: 6, label: "Medium" },
  { size: 12, label: "Thick" },
];

export function CanvasToolbar(props: CanvasToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface/95
                 px-2 py-1.5 shadow-lg backdrop-blur"
    >
      <Group>
        {TOOLS.map((entry) => (
          <IconButton
            key={entry.tool}
            label={entry.label}
            pressed={props.tool === entry.tool}
            onClick={() => props.onToolChange(entry.tool)}
          >
            {entry.icon}
          </IconButton>
        ))}
      </Group>

      <Divider />

      <Group>
        {CANVAS_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Color ${swatch}`}
            aria-pressed={props.color === swatch}
            onClick={() => props.onColorChange(swatch)}
            className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
              props.color === swatch ? "border-text-1 ring-2 ring-accent" : "border-border"
            }`}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </Group>

      <Divider />

      <Group>
        {SIZES.map((entry) => (
          <IconButton
            key={entry.size}
            label={`${entry.label} stroke`}
            pressed={props.strokeSize === entry.size}
            onClick={() => props.onStrokeSizeChange(entry.size)}
          >
            <span
              className="block rounded-full bg-current"
              style={{ width: entry.size + 2, height: entry.size + 2 }}
            />
          </IconButton>
        ))}
      </Group>

      <Divider />

      <Group>
        <IconButton label="Add image" onClick={() => fileRef.current?.click()}>
          <IconImage />
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) props.onAddImage(file);
            e.target.value = "";
          }}
        />
        <IconButton
          label="Delete selection"
          onClick={props.onDelete}
          disabled={!props.hasSelection}
        >
          <IconTrash />
        </IconButton>
      </Group>

      <Divider />

      <Group>
        <IconButton label="Undo" onClick={props.onUndo} disabled={!props.canUndo}>
          <IconUndo />
        </IconButton>
        <IconButton label="Redo" onClick={props.onRedo} disabled={!props.canRedo}>
          <IconRedo />
        </IconButton>
      </Group>

      <Divider />

      <Group>
        <IconButton label="Zoom out" onClick={props.onZoomOut}>
          <span className="text-base leading-none">-</span>
        </IconButton>
        <button
          type="button"
          onClick={props.onResetView}
          aria-label="Reset view"
          className="min-w-[3.25rem] rounded-md px-1 py-1 font-mono text-xs text-text-2 hover:bg-surface-2"
        >
          {Math.round(props.zoom * 100)}%
        </button>
        <IconButton label="Zoom in" onClick={props.onZoomIn}>
          <span className="text-base leading-none">+</span>
        </IconButton>
      </Group>
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

function Divider() {
  return <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />;
}

function IconButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors
        disabled:cursor-not-allowed disabled:opacity-40 ${
          pressed
            ? "bg-primary text-on-primary"
            : "text-text-2 hover:bg-surface-2 hover:text-text-1"
        }`}
    >
      {children}
    </button>
  );
}

/* Minimal inline icons, 18px, currentColor. */
const svg = "h-[18px] w-[18px]";

function IconSelect() {
  return (
    <svg className={svg} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5 3l14 7-6 2-2 6-6-15z" />
    </svg>
  );
}
function IconPen() {
  return (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 20l4-1L19 8l-3-3L5 16l-1 4z" />
    </svg>
  );
}
function IconRect() {
  return (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  );
}
function IconEllipse() {
  return (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <ellipse cx="12" cy="12" rx="8" ry="6" />
    </svg>
  );
}
function IconText() {
  return (
    <svg className={svg} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5 4h14v3h-1.5l-.5-1.5H13V18l2 .5V20H9v-1.5l2-.5V5.5H6.9L6.5 7H5V4z" />
    </svg>
  );
}
function IconImage() {
  return (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" stroke="none" />
      <path d="M5 17l4-4 3 3 3-4 4 5" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  );
}
function IconUndo() {
  return (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1" />
    </svg>
  );
}
function IconRedo() {
  return (
    <svg className={svg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10h1" />
    </svg>
  );
}
