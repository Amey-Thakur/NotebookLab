/*
 * Title: generate-logo.js
 * Tech Stack: Node.js
 * Description: Programmatically generates NotebookLab logo SVGs with precise
 *   geometry. Produces horizontal, icon-only, and dark variants.
 * Important Details: All coordinates are computed mathematically, not hand-placed.
 *   Run with: node scripts/generate-logo.js
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "logos", "final");
mkdirSync(OUT, { recursive: true });

/* Brand tokens */
const BRAND = {
  accent: "#4A70A9",
  accentLight: "#8FABD4",
  cream: "#EFECE3",
  black: "#000000",
  darkBg: "#111111",
  font: "Play",
};

/* ── Icon builder: Stacked Pages with thinking trail ── */

function buildIcon({ size = 80, theme = "light" }) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;

  /* Page dimensions */
  const pageW = s * 0.55;
  const pageH = s * 0.72;
  const stackOffset = s * 0.07;
  const radius = s * 0.025;

  /* Three page positions (back to front) */
  const pages = [
    { x: cx - pageW / 2 + stackOffset * 2, y: cy - pageH / 2 - stackOffset, opacity: 0.22, sw: 1.3 },
    { x: cx - pageW / 2 + stackOffset, y: cy - pageH / 2, opacity: 0.42, sw: 1.6 },
    { x: cx - pageW / 2, y: cy - pageH / 2 + stackOffset, opacity: 1, sw: 2.2 },
  ];

  const stroke = theme === "dark" ? BRAND.accentLight : BRAND.accent;
  const lineColor = BRAND.accentLight;

  let svg = "";

  /* Draw pages */
  for (const p of pages) {
    const alpha = p.opacity;
    const col = alpha < 1 ? BRAND.accentLight : stroke;
    svg += `    <rect x="${r2(p.x)}" y="${r2(p.y)}" width="${r2(pageW)}" height="${r2(pageH)}" rx="${r2(radius)}" fill="none" stroke="${col}" stroke-width="${p.sw}" opacity="${alpha}" />\n`;
  }

  /* Text lines on front page */
  const fp = pages[2];
  const lineStartX = fp.x + s * 0.1;
  const lineGap = s * 0.1;
  for (let i = 0; i < 4; i++) {
    const ly = fp.y + s * 0.16 + i * lineGap;
    const lw = pageW * (0.55 + Math.sin(i * 1.7) * 0.15);
    svg += `    <line x1="${r2(lineStartX)}" y1="${r2(ly)}" x2="${r2(lineStartX + lw)}" y2="${r2(ly)}" stroke="${lineColor}" stroke-width="1.3" opacity="0.28" stroke-linecap="round" />\n`;
  }

  /* Thinking trail: three dots converging from back-page to front-page */
  const dots = [
    { cx: fp.x + pageW * 0.85, cy: fp.y - stackOffset * 1.5, r: s * 0.032, opacity: 0.35, fill: BRAND.accentLight },
    { cx: fp.x + pageW * 0.72, cy: fp.y + pageH * 0.35, r: s * 0.04, opacity: 0.55, fill: BRAND.accentLight },
    { cx: fp.x + pageW * 0.6, cy: fp.y + pageH * 0.68, r: s * 0.055, opacity: 0.85, fill: BRAND.accent },
  ];

  /* Connection paths between dots */
  for (let i = 0; i < dots.length - 1; i++) {
    const a = dots[i];
    const b = dots[i + 1];
    const midX = (a.cx + b.cx) / 2 - s * 0.03;
    const midY = (a.cy + b.cy) / 2;
    const col = i === 0 ? BRAND.accentLight : BRAND.accent;
    const op = i === 0 ? 0.3 : 0.4;
    svg += `    <path d="M${r2(a.cx)},${r2(a.cy + a.r)} Q${r2(midX)},${r2(midY)} ${r2(b.cx)},${r2(b.cy - b.r)}" fill="none" stroke="${col}" stroke-width="1.2" opacity="${op}" />\n`;
  }

  /* Draw dots */
  for (const d of dots) {
    svg += `    <circle cx="${r2(d.cx)}" cy="${r2(d.cy)}" r="${r2(d.r)}" fill="${d.fill}" opacity="${d.opacity}" />\n`;
  }

  /* Inner circle on the main dot (the insight) */
  const main = dots[dots.length - 1];
  svg += `    <circle cx="${r2(main.cx)}" cy="${r2(main.cy)}" r="${r2(main.r * 0.45)}" fill="${theme === "dark" ? BRAND.darkBg : BRAND.cream}" />\n`;

  /* Peripheral accent dots */
  svg += `    <circle cx="${r2(fp.x + pageW + s * 0.06)}" cy="${r2(fp.y + s * 0.05)}" r="${r2(s * 0.018)}" fill="${BRAND.accentLight}" opacity="0.25" />\n`;
  svg += `    <circle cx="${r2(fp.x + pageW * 0.9)}" cy="${r2(fp.y + pageH * 0.85)}" r="${r2(s * 0.02)}" fill="${BRAND.accentLight}" opacity="0.2" />\n`;

  return svg;
}

/* ── Full SVG assemblers ── */

function horizontalLogo(theme = "light") {
  const iconSize = 80;
  const totalW = 440;
  const totalH = 100;
  const textColor = theme === "dark" ? BRAND.cream : BRAND.black;
  const labColor = theme === "dark" ? BRAND.accentLight : BRAND.accent;
  const tagColor = BRAND.accentLight;
  const tagOpacity = theme === "dark" ? 0.6 : 1;

  let bg = "";
  if (theme === "dark") {
    bg = `  <rect width="${totalW}" height="${totalH}" fill="${BRAND.darkBg}" rx="6" />\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" role="img" aria-labelledby="logo-t logo-d">
  <title id="logo-t">NotebookLab Logo</title>
  <desc id="logo-d">Stacked pages with a thinking trail representing knowledge synthesis</desc>
${bg}  <g id="icon" transform="translate(8, 10)">
${buildIcon({ size: iconSize, theme })}  </g>

  <g id="wordmark">
    <text x="100" y="54" font-family="${BRAND.font}, sans-serif" font-size="38" font-weight="700" fill="${textColor}">Notebook</text>
    <text x="322" y="54" font-family="${BRAND.font}, sans-serif" font-size="38" font-weight="700" fill="${labColor}">Lab</text>
    <text x="102" y="74" font-family="${BRAND.font}, sans-serif" font-size="9.5" font-weight="400" fill="${tagColor}" letter-spacing="2.5" opacity="${tagOpacity}">YOUR THINKING PARTNER</text>
  </g>
</svg>`;
}

function iconOnly(theme = "light") {
  const size = 80;
  let bg = "";
  if (theme === "dark") {
    bg = `  <rect width="${size}" height="${size}" fill="${BRAND.darkBg}" rx="8" />\n`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-labelledby="icon-t">
  <title id="icon-t">NotebookLab Icon</title>
${bg}${buildIcon({ size, theme })}
</svg>`;
}

/* ── Utility ── */

function r2(n) {
  return Math.round(n * 100) / 100;
}

/* ── Generate all variants ── */

const variants = [
  { name: "notebooklab-horizontal-light.svg", fn: () => horizontalLogo("light") },
  { name: "notebooklab-horizontal-dark.svg", fn: () => horizontalLogo("dark") },
  { name: "notebooklab-icon-light.svg", fn: () => iconOnly("light") },
  { name: "notebooklab-icon-dark.svg", fn: () => iconOnly("dark") },
];

for (const v of variants) {
  const path = join(OUT, v.name);
  writeFileSync(path, v.fn());
  console.log(`Generated: ${v.name}`);
}

console.log(`\nAll ${variants.length} variants written to logos/final/`);
