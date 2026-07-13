/*
 * Name: author-portrait.tsx
 * Purpose: A maker's portrait, pulled live from GitHub with a graceful
 *   offline fallback.
 * Description: The image comes straight from the author's GitHub avatar URL,
 *   so when they change their profile picture the app follows without a
 *   release. Because NotebookLab must look whole with no network at all, the
 *   portrait renders as styled initials first and the photograph fades in
 *   over them only once it has actually loaded.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState } from "react";

import { cn } from "@/lib/utils";

interface AuthorPortraitProps {
  /** GitHub username; the avatar is fetched from github.com/<handle>.png */
  handle: string;
  /** Full name, used for the initials fallback */
  name: string;
}

export function AuthorPortrait({ handle, name }: AuthorPortraitProps) {
  const [loaded, setLoaded] = useState(false);

  const initials = name
    .split(" ")
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span className="relative block h-20 w-20 shrink-0 overflow-hidden border border-border bg-surface-2">
      {/* Initials underneath; visible until the live photo arrives, and
          forever when the machine is offline */}
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center font-display text-xl font-bold text-accent"
      >
        {initials}
      </span>
      <img
        src={`https://github.com/${handle}.png?size=160`}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}
