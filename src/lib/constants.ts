/*
 * Title: constants.ts
 * Tech Stack: TypeScript
 * Description: Application-wide constants and configuration values.
 * Important Details: Route paths are defined here to avoid magic strings in components.
 *   Query key prefixes ensure TanStack Query cache isolation between features.
 */


export const ROUTES = {
  NOTEBOOKS: "/notebooks",
  NOTEBOOK_DETAIL: "/notebooks/:id",
  EDITOR: "/editor/:id",
  SEARCH: "/search",
  CHAT: "/chat",
  THINKING_PARTNER: "/thinking-partner",
  DOCUMENTS: "/documents",
  TRANSFORMS: "/transforms",
  PODCASTS: "/podcasts",
  MODELS: "/models",
  SETTINGS: "/settings",
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
  CHUNK_COUNT: "chunk-count",
  SIDECAR: "sidecar",
} as const;


/* Must match parsers/mod.rs::parser_for_extension */
export const SUPPORTED_FILE_TYPES = [
  ".txt",
  ".text",
  ".md",
  ".markdown",
  ".pdf",
] as const;


/* Auto-save interval for the editor in milliseconds */
export const EDITOR_AUTOSAVE_MS = 2000;
