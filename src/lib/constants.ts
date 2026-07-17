/*
 * Name: constants.ts
 * Purpose: Application-wide constants and configuration values.
 * Description: Route paths are defined here to avoid magic strings in
 *   components. Query key prefixes ensure TanStack Query cache
 *   isolation between features.
 * Tech Stack: TypeScript
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

export const ROUTES = {
  HOME: "/",
  NOTEBOOKS: "/notebooks",
  NOTEBOOK_DETAIL: "/notebooks/:id",
  EDITOR: "/editor/:id",
  SEARCH: "/search",
  CHAT: "/chat",
  THINKING_PARTNER: "/thinking-partner",
  STUDIO: "/studio",
  CANVAS: "/canvas",
  DOCUMENTS: "/documents",
  TRANSFORMS: "/transforms",
  PODCASTS: "/podcasts",
  PROMPT_STUDIO: "/prompt-studio",
  GRAPH: "/graph",
  MODELS: "/models",
  SETTINGS: "/settings",
  HELP: "/help",
  ABOUT: "/about",
} as const;


export const QUERY_KEYS = {
  NOTEBOOKS: "notebooks",
  DOCUMENTS: "documents",
  NOTES: "notes",
  NOTE: "note",
  BACKLINKS: "backlinks",
  SEARCH: "search",
  CHAT: "chat",
  CONVERSATIONS: "conversations",
  CITATIONS: "citations",
  SETTINGS: "settings",
  PROVIDERS: "providers",
  ACTIVE_PROVIDER: "active-provider",
  SAVED_PROVIDERS: "saved-providers",
  OLLAMA_STATUS: "ollama-status",
  OLLAMA_MODELS: "ollama-models",
  HARDWARE: "hardware",
  CHUNK_COUNT: "chunk-count",
  SIDECAR: "sidecar",
  GRAPH: "graph",
  CANVAS: "canvas",
} as const;


/* Must match parsers/mod.rs::parser_for_extension. Images are read with OCR.
   (.doc, the legacy binary Word format, is intentionally not supported.) */
export const SUPPORTED_FILE_TYPES = [
  ".txt",
  ".text",
  ".md",
  ".markdown",
  ".pdf",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".tiff",
  ".tif",
  ".webp",
  ".bmp",
] as const;

/** True when a file path ends in one of the supported import extensions. */
export function isSupportedFileType(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_FILE_TYPES.some((extension) => lower.endsWith(extension));
}

/* The image formats above, read with OCR. Used to group the import picker. */
export const OCR_IMAGE_TYPES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".tiff",
  ".tif",
  ".webp",
  ".bmp",
] as const;


/* Auto-save interval for the editor in milliseconds */
export const EDITOR_AUTOSAVE_MS = 2000;
