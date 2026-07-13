/*
 * Name: canvas-board.test.tsx
 * Purpose: Render-safety test for the canvas board.
 * Description: Renders the board with one of every element kind to SVG markup
 *   and checks the output. This exercises the element views and the
 *   perfect-freehand stroke path in the real render path, so a crash or a bad
 *   shape is caught in CI without needing the desktop runtime.
 * Tech Stack: Vitest, react-dom/server
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CanvasBoard } from "./canvas-board";
import type { CanvasElement } from "../types";

const noop = () => {};

const elements: CanvasElement[] = [
  { id: "s", type: "stroke", points: [[0, 0, 0.5], [10, 10, 0.5], [20, 5, 0.5]], color: "#111", size: 6 },
  { id: "r", type: "rectangle", x: 30, y: 30, w: 40, h: 20, color: "#e11d48", fill: "none", strokeWidth: 2 },
  { id: "e", type: "ellipse", x: 80, y: 30, w: 40, h: 30, color: "#10b981", fill: "#10b981", strokeWidth: 2 },
  { id: "t", type: "text", x: 5, y: 80, text: "Hello\nworld", color: "#000", fontSize: 20 },
  {
    id: "img",
    type: "image",
    x: 100,
    y: 100,
    w: 60,
    h: 40,
    src: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
  },
];

describe("CanvasBoard", () => {
  it("renders every element kind to SVG without throwing", () => {
    const markup = renderToStaticMarkup(
      <CanvasBoard
        elements={elements}
        camera={{ x: 0, y: 0, zoom: 1 }}
        tool="select"
        color="#111"
        strokeSize={6}
        selectedId="r"
        onCameraChange={noop}
        onSelect={noop}
        onCommit={noop}
        onToolChange={noop}
        onDropImage={noop}
      />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain("<path"); // stroke, via perfect-freehand
    expect(markup).toContain("<rect"); // rectangle + selection outline + grid backdrop
    expect(markup).toContain("<ellipse");
    expect(markup).toContain("Hello");
    expect(markup).toContain("world"); // second text line as a tspan
    expect(markup).toContain("<image");
  });
});
