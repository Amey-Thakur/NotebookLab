/*
 * Name: slide-deck-view.tsx
 * Purpose: Render a generated slide deck.
 * Description: Shows one slide at a time on a 16:9 stage with its title and
 *   bullets, and steps through the deck with previous/next and a counter. The
 *   current slide is clamped to the deck size so it stays valid. Falls back to a
 *   plain message when the model returns no slides.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { useState } from "react";

import type { SlideDeck } from "../api/studio-api";

export function SlideDeckView({ data }: { data: SlideDeck }) {
  const slides = data.slides ?? [];
  const [index, setIndex] = useState(0);

  if (slides.length === 0) {
    return <p className="text-sm text-text-3">The deck came back empty. Try a broader focus.</p>;
  }

  const current = Math.min(index, slides.length - 1);
  const slide = slides[current];
  const step = (delta: number) =>
    setIndex(() => Math.max(0, Math.min(slides.length - 1, current + delta)));

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-4 font-display text-lg font-bold text-text-1">{data.title}</h2>

      <div className="flex aspect-video flex-col overflow-y-auto border border-border bg-surface p-8">
        <h3 className="mb-4 font-display text-xl font-bold text-text-1">{slide.title}</h3>
        <ul className="list-disc space-y-2 pl-5 font-body text-text-2">
          {(slide.bullets ?? []).map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={current === 0}
          className="border border-border px-3 py-1.5 font-mono text-sm text-text-2 transition-colors hover:border-accent-dim disabled:opacity-40"
        >
          Previous
        </button>
        <span className="font-mono text-xs text-text-4">
          {current + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={current === slides.length - 1}
          className="border border-border px-3 py-1.5 font-mono text-sm text-text-2 transition-colors hover:border-accent-dim disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
