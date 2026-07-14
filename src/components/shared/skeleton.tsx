/*
 * Name: skeleton.tsx
 * Purpose: A calm loading placeholder.
 * Description: A pulsing block used in place of bare "Loading..." text while
 *   content is fetched, so pages settle in gracefully instead of flashing text.
 *   Decorative, and stands down under reduced-motion.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-sm bg-surface-2 motion-reduce:animate-none", className)}
    />
  );
}
