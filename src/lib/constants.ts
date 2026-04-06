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
  PODCASTS: "/podcasts",
  MODELS: "/models",
  SETTINGS: "/settings",
} as const;


export const QUERY_KEYS = {
  NOTEBOOKS: "notebooks",
  DOCUMENTS: "documents",
  NOTES: "notes",
  SEARCH: "search",
  CHAT: "chat",
  MODELS: "models",
  SETTINGS: "settings",
  GRAPH: "graph",
  PODCASTS: "podcasts",
} as const;


export const SUPPORTED_FILE_TYPES = [
  ".pdf",
  ".docx",
  ".doc",
  ".txt",
  ".md",
  ".markdown",
] as const;


/* Auto-save interval for the editor in milliseconds */
export const EDITOR_AUTOSAVE_MS = 2000;
