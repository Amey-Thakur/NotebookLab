/*
 * Name: flashcards-view.tsx
 * Purpose: Study the generated flashcards one at a time.
 * Description: One card fills the space; clicking it (or pressing Enter or
 *   Space) flips between the prompt and the answer, and the arrows move through
 *   the set. A live region announces each side so the deck is usable by screen
 *   reader and keyboard alone. Nothing here is decorative; every card is real
 *   content drawn from the notebook's own sources.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { useState } from "react";

import { asArray, type Flashcard } from "../api/studio-api";

export function FlashcardsView({ cards }: { cards: Flashcard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const items = asArray<Flashcard>(cards);
  if (items.length === 0) {
    return <p className="text-sm text-text-3">No cards came back. Try a broader focus.</p>;
  }

  const current = Math.min(index, items.length - 1);
  const card = items[current];
  const move = (delta: number) => {
    setIndex(() => (current + delta + items.length) % items.length);
    setFlipped(false);
  };

  return (
    <div className="max-w-xl mx-auto">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Card answer, click to see the prompt" : "Card prompt, click to reveal the answer"}
        className="w-full min-h-[220px] p-8 flex flex-col items-center justify-center text-center
                   border border-border bg-surface hover:border-accent-dim focus-visible:border-accent
                   outline-none transition-colors"
      >
        <span className="text-2xs font-mono uppercase tracking-widest text-text-4 mb-4">
          {flipped ? "Answer" : "Prompt"}
        </span>
        <span aria-live="polite" className="font-body text-lg text-text-1 leading-relaxed">
          {flipped ? card?.back : card?.front}
        </span>
        {!flipped && <span className="mt-5 text-xs text-text-4">Click to flip</span>}
      </button>

      <div className="flex items-center justify-between mt-4">
        <button
          type="button"
          onClick={() => move(-1)}
          className="px-3 py-1.5 text-xs font-mono text-text-3 border border-border
                     hover:text-text-1 hover:border-border-hover transition-colors"
        >
          Previous
        </button>
        <span className="text-xs font-mono text-text-4">
          {current + 1} of {items.length}
        </span>
        <button
          type="button"
          onClick={() => move(1)}
          className="px-3 py-1.5 text-xs font-mono text-text-3 border border-border
                     hover:text-text-1 hover:border-border-hover transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
