/*
 * Name: export-png.ts
 * Purpose: Turn the canvas into a PNG the user can keep.
 * Description: The board is live SVG, which is only useful inside the app. This
 *   serializes it, rasterizes it through an image, and hands back a PNG, so a
 *   diagram drawn here can go into a document, a message, or a slide.
 *
 *   The serialized copy is deliberately given explicit dimensions and an opaque
 *   background. An SVG that inherits both from the page looks right on screen
 *   and exports as a transparent sliver, which is the classic way this goes
 *   wrong and is invisible until someone opens the file somewhere dark.
 * Tech Stack: TypeScript, SVG, Canvas
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

/** Drawn at twice the on-screen size, so the export is not soft when enlarged. */
const EXPORT_SCALE = 2;

/**
 * Rasterize an SVG element to a PNG blob.
 *
 * Rejects rather than returning a blank image when anything fails, so the caller
 * can say so instead of saving a file that turns out to be empty.
 */
export async function svgToPng(svg: SVGSVGElement, background: string): Promise<Blob> {
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  /* Work on a copy: the live node must keep the attributes the app set on it. */
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await loadImage(url);
    const out = document.createElement("canvas");
    out.width = width * EXPORT_SCALE;
    out.height = height * EXPORT_SCALE;

    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the export.");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(image, 0, 0, out.width, out.height);

    return await new Promise<Blob>((resolve, reject) => {
      out.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the canvas."));
    image.src = src;
  });
}
