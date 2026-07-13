/*
 * Name: image.ts
 * Purpose: Turn a dropped or chosen image file into an embeddable data URL.
 * Description: Loads the file, downscales it to a sane maximum so the canvas
 *   scene stays small, and encodes it as a JPEG data URL on a white ground.
 *   Embedding the image keeps the scene self-contained and offline.
 * Tech Stack: TypeScript, Canvas API
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export interface ScaledImage {
  src: string;
  width: number;
  height: number;
}

/** Read an image file, downscale it, and return a data URL plus its size. */
export async function fileToScaledImage(file: File): Promise<ScaledImage> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the image.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return { src: canvas.toDataURL("image/jpeg", JPEG_QUALITY), width, height };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}
