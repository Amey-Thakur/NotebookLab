/*
 * Name: accessibility.ts
 * Purpose: Apply and persist the accessibility preferences: UI scale and
 *   high contrast.
 * Description: The whole interface is sized in rem, so scaling the root
 *   font-size scales everything faithfully, exactly like a browser
 *   zoom that persists. High contrast flips a data attribute that
 *   globals.css answers with stronger text and border tokens. Both
 *   read from localStorage at boot so a preference survives every
 *   restart, and both clamp their input so a corrupted stored value
 *   can never break the layout.
 * Tech Stack: TypeScript, localStorage
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-17
 */

const UI_SCALE_KEY = "notebooklab-ui-scale";
const CONTRAST_KEY = "notebooklab-high-contrast";

export const UI_SCALE_MIN = 80;
export const UI_SCALE_MAX = 150;
export const UI_SCALE_DEFAULT = 100;

function clampScale(value: number): number {
  if (Number.isNaN(value)) return UI_SCALE_DEFAULT;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Math.round(value)));
}

/** The stored scale in percent, safe to render immediately. */
export function getUiScale(): number {
  return clampScale(Number(localStorage.getItem(UI_SCALE_KEY) ?? UI_SCALE_DEFAULT));
}

/** Apply and persist a scale in percent. Returns the clamped value. */
export function setUiScale(percent: number): number {
  const clamped = clampScale(percent);
  document.documentElement.style.fontSize = clamped === UI_SCALE_DEFAULT ? "" : `${clamped}%`;
  try {
    if (clamped === UI_SCALE_DEFAULT) localStorage.removeItem(UI_SCALE_KEY);
    else localStorage.setItem(UI_SCALE_KEY, String(clamped));
  } catch {
    /* Storage full or blocked: the scale still applies for this session. */
  }
  return clamped;
}

export function getHighContrast(): boolean {
  return localStorage.getItem(CONTRAST_KEY) === "1";
}

export function setHighContrast(on: boolean): void {
  if (on) document.documentElement.setAttribute("data-contrast", "high");
  else document.documentElement.removeAttribute("data-contrast");
  try {
    if (on) localStorage.setItem(CONTRAST_KEY, "1");
    else localStorage.removeItem(CONTRAST_KEY);
  } catch {
    /* Same story: the attribute is set, only persistence failed. */
  }
}

/** Called once at boot, before first paint matters. */
export function initAccessibility(): void {
  const scale = getUiScale();
  if (scale !== UI_SCALE_DEFAULT) document.documentElement.style.fontSize = `${scale}%`;
  if (getHighContrast()) document.documentElement.setAttribute("data-contrast", "high");
}
