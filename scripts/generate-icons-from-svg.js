/*
 * Title: generate-icons-from-svg.js
 * Tech Stack: Node.js
 * Description: Converts the programmatically generated SVG icon into PNG app icons
 *   at all sizes Tauri requires. Uses a canvas-free approach by generating
 *   properly sized SVGs with embedded rasterization hints.
 * Important Details: Tauri needs 32x32, 128x128, 256x256, 512x512 PNGs and an ICO.
 *   This script generates fresh PNGs using the icon geometry from generate-logo.js.
 */

import { writeFileSync, readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "src-tauri", "icons");
const LOGO_DIR = join(__dirname, "..", "logos", "final");

/* Check if we have a tool to convert SVG to PNG */
function hasConverter() {
  try {
    execSync("npx --yes sharp-cli --version", { stdio: "pipe" });
    return "sharp";
  } catch {
    return null;
  }
}

const converter = hasConverter();

if (!converter) {
  console.log("No SVG-to-PNG converter available.");
  console.log("Install sharp-cli: npm install -g sharp-cli");
  console.log("Or convert manually: open logos/final/notebooklab-icon-light.svg in a browser and export as PNG.");
  process.exit(0);
}

const svgPath = join(LOGO_DIR, "notebooklab-icon-light.svg");
const svgContent = readFileSync(svgPath, "utf8");

const sizes = [
  { name: "32x32.png", size: 32 },
  { name: "128x128.png", size: 128 },
  { name: "128x128@2x.png", size: 256 },
  { name: "icon.png", size: 512 },
];

console.log("Converting SVG icon to PNGs...");

for (const { name, size } of sizes) {
  const outPath = join(ICONS_DIR, name);
  try {
    execSync(
      `npx --yes sharp-cli -i "${svgPath}" -o "${outPath}" resize ${size} ${size}`,
      { stdio: "pipe" }
    );
    console.log(`  ${name}: ${size}x${size}`);
  } catch (e) {
    console.error(`  Failed: ${name} - ${e.message}`);
  }
}

console.log("\nDone. Verify icons in src-tauri/icons/");
