/*
 * Name: download.ts
 * Purpose: Save what a feature produced to a file on disk.
 * Description: Generations were readable in the app and nowhere else. A study
 *   guide, a mind map, an audio script or a canvas could not leave without
 *   selecting the text by hand, which is the point at which a tool stops being
 *   part of someone's work. Every feature now offers the same save, so the
 *   answer is the user's file rather than a panel they have to keep open.
 *
 *   A `data:` URL is deliberately not used. Chromium caps navigation to one at
 *   a size a long study guide can reach, and it fails silently at that point.
 *   An object URL has no such ceiling and is revoked once the click is done.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

/** Characters no common filesystem accepts inside a file name. */
const UNSAFE = "\\/:*?\"<>|";

/** Trim a title down to something every filesystem will accept. */
export function toFileName(title: string, extension: string): string {
  const base = Array.from(title.normalize("NFKD"))
    /* Windows refuses \ / : * ? " < > | outright, and control characters break
       things more quietly on every platform. Filtering by code point rather
       than a regex class keeps the control range readable and keeps literal
       control bytes out of the source. */
    .map((ch) => (ch.codePointAt(0)! < 0x20 || UNSAFE.includes(ch) ? " " : ch))
    .join("")
    .replace(/\s+/g, "-")
    /* A leading or trailing dot is what turns a name into a hidden file, or one
       Windows Explorer quietly renames. */
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "notebooklab"}.${extension}`;
}


/**
 * Save text as a file.
 *
 * Returns nothing and throws nothing: a browser that refuses the click leaves
 * the user exactly where they were, with the content still on screen.
 */
export function downloadText(content: string, fileName: string, mime = "text/plain"): void {
  downloadBlob(new Blob([content], { type: `${mime};charset=utf-8` }), fileName);
}

/** Save an already-built blob, revoking the URL once the click has been taken. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  /* Must be in the document for the click to count in every engine. */
  document.body.appendChild(link);
  link.click();
  link.remove();
  /* Revoking immediately can cancel the download in some engines, so this waits
     a turn of the event loop rather than freeing it out from under the click. */
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Save a `data:` URL, such as the canvas image export, as a file. */
export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
