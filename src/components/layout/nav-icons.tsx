/*
 * Name: nav-icons.tsx
 * Purpose: Line icons for the sidebar navigation.
 * Description: One small, consistent line icon per navigation destination, so
 *   the sidebar reads at a glance and can collapse to an icon-only rail. All
 *   share a single stroke style and inherit color from the link, matching the
 *   hand-drawn icons used elsewhere in the app rather than pulling in an icon
 *   dependency. Icons are decorative; the link carries the accessible name.
 * Tech Stack: React 19, SVG
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import type { ReactNode } from "react";

/* A plain builder (not a component) so this module exports only icon data and
   keeps fast refresh happy. */
function strokeIcon(paths: ReactNode): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {paths}
    </svg>
  );
}

export type NavIconName =
  | "home"
  | "notebooks"
  | "documents"
  | "search"
  | "connections"
  | "chat"
  | "think"
  | "studio"
  | "canvas"
  | "transform"
  | "audio"
  | "prompt"
  | "models"
  | "settings"
  | "help"
  | "about";

export const NAV_ICONS: Record<NavIconName, ReactNode> = {
  home: strokeIcon(
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </>,
  ),
  notebooks: strokeIcon(
    <>
      <path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z" />
      <path d="M6 3v18" />
      <path d="M9.5 8h6M9.5 12h6" />
    </>,
  ),
  documents: strokeIcon(
    <>
      <path d="M6 2h8l4 4v16H6z" />
      <path d="M14 2v4h4" />
      <path d="M9 13h6M9 17h4" />
    </>,
  ),
  search: strokeIcon(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>,
  ),
  connections: strokeIcon(
    <>
      <circle cx="5.5" cy="6" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="10" cy="18" r="2" />
      <path d="M7.4 6.6 16 7.6M8.6 16.4 9.6 9.9M11.7 16.6 16.4 9.6" />
    </>,
  ),
  chat: strokeIcon(<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l.8-5.5A8 8 0 1 1 21 12z" />),
  think: strokeIcon(
    <>
      <path d="M9.5 18h5" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2h6c0-.8.3-1.3 1-2A6 6 0 0 0 12 3z" />
    </>,
  ),
  studio: strokeIcon(
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </>,
  ),
  canvas: strokeIcon(
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>,
  ),
  transform: strokeIcon(
    <>
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </>,
  ),
  audio: strokeIcon(<path d="M4 10v4M8 6.5v11M12 3.5v17M16 7v10M20 10v4" />),
  prompt: strokeIcon(
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7 9.5l3 2.5-3 2.5M13 14.5h4" />
    </>,
  ),
  models: strokeIcon(
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M10 3v2.5M14 3v2.5M10 18.5V21M14 18.5V21M3 10h2.5M3 14h2.5M18.5 10H21M18.5 14H21" />
    </>,
  ),
  settings: strokeIcon(
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M4.4 4.4l2.1 2.1M17.5 17.5l2.1 2.1M2.5 12h3M18.5 12h3M4.4 19.6l2.1-2.1M17.5 6.5l2.1-2.1" />
    </>,
  ),
  help: strokeIcon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.2a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.1.9-1.1 1.8" />
      <path d="M12 16.5h.01" />
    </>,
  ),
  about: strokeIcon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </>,
  ),
};
