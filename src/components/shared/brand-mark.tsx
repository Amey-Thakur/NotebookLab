/*
 * Name: brand-mark.tsx
 * Purpose: The NotebookLab logo, as one reusable mark.
 * Description: The same logo used on the website, in the README, and as the
 *   favicon: two stacked pages with a single bright node, the moment an idea
 *   catches. It is a colored mark with its own gradients, so it looks identical
 *   in light and dark themes, and every place that shows the logo renders this
 *   one component so the brand never drifts. Gradient ids are made unique per
 *   instance so several marks on a page never collide.
 * Tech Stack: React 19, SVG
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useId } from "react";

interface BrandMarkProps {
  /** Sizing classes, e.g. h-14 w-14. The mark carries its own colors. */
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  const id = useId();
  const page = `${id}-page`;
  const back = `${id}-back`;
  const halo = `${id}-halo`;

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={page} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a7dd6" />
          <stop offset="1" stopColor="#2b57a8" />
        </linearGradient>
        <linearGradient id={back} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fb5f0" />
          <stop offset="1" stopColor="#4a7dd6" />
        </linearGradient>
        <radialGradient id={halo}>
          <stop offset="0" stopColor="#bcd7ff" stopOpacity=".9" />
          <stop offset="1" stopColor="#bcd7ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="18" y="8" width="34" height="46" rx="5" fill={`url(#${back})`} opacity=".45" />
      <rect x="12" y="13" width="34" height="46" rx="5" fill={`url(#${page})`} />
      <rect x="12" y="13" width="5" height="46" rx="2.5" fill="#ffffff" opacity=".14" />
      <rect x="21" y="22" width="18" height="3" rx="1.5" fill="#eaf1ff" opacity=".95" />
      <rect x="21" y="29" width="14" height="3" rx="1.5" fill="#eaf1ff" opacity=".75" />
      <rect x="21" y="36" width="16" height="3" rx="1.5" fill="#eaf1ff" opacity=".55" />
      <circle cx="40" cy="48" r="10" fill={`url(#${halo})`} />
      <circle cx="40" cy="48" r="5" fill="#bcd7ff" />
      <circle cx="40" cy="48" r="2.2" fill="#1d3f7e" />
    </svg>
  );
}
