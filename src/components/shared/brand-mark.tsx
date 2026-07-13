/*
 * Name: brand-mark.tsx
 * Purpose: The NotebookLab icon, as one reusable mark.
 * Description: The stacked notebooks and the linked nodes rising from the page
 *   are the app's identity: pages that become a small web of connected ideas.
 *   This is the same geometry as the packaged app icon, drawn in a single
 *   accent tone through currentColor so it stays crisp at any size and reads
 *   correctly in both themes. Every place that shows the logo uses this one
 *   component, so the brand never drifts.
 * Tech Stack: React 19, SVG, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

interface BrandMarkProps {
  /** Sizing and color classes. Set the color with a text-* token, e.g. text-accent. */
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true" className={className}>
      {/* Three notebooks, stacked and offset, the nearest most present */}
      <rect x="29.2" y="5.6" width="44" height="57.6" rx="2" stroke="currentColor" strokeWidth="1.3" opacity="0.2" />
      <rect x="23.6" y="11.2" width="44" height="57.6" rx="2" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
      <rect x="18" y="16.8" width="44" height="57.6" rx="2" stroke="currentColor" strokeWidth="2.2" />

      {/* Lines of writing on the front page */}
      <line x1="26" y1="29.6" x2="50.2" y2="29.6" stroke="currentColor" strokeWidth="1.3" opacity="0.3" strokeLinecap="round" />
      <line x1="26" y1="37.6" x2="56.7" y2="37.6" stroke="currentColor" strokeWidth="1.3" opacity="0.3" strokeLinecap="round" />
      <line x1="26" y1="45.6" x2="48.5" y2="45.6" stroke="currentColor" strokeWidth="1.3" opacity="0.3" strokeLinecap="round" />
      <line x1="26" y1="53.6" x2="44.1" y2="53.6" stroke="currentColor" strokeWidth="1.3" opacity="0.3" strokeLinecap="round" />

      {/* Ideas linking into a small graph */}
      <path d="M55.4 10.96 Q50.14 22.68 49.68 33.76" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      <path d="M49.68 40.16 Q44.64 46.46 44.4 51.57" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <circle cx="55.4" cy="8.4" r="2.56" fill="currentColor" opacity="0.4" />
      <circle cx="49.68" cy="36.96" r="3.2" fill="currentColor" opacity="0.6" />
      <circle cx="44.4" cy="55.97" r="4.4" fill="currentColor" />
    </svg>
  );
}
