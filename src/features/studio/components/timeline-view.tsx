/*
 * Name: timeline-view.tsx
 * Purpose: Render a generated timeline.
 * Description: Lays the events out as a vertical timeline with a rail, dated
 *   markers, and short descriptions, drawn from the theme tokens so it reads in
 *   light and dark. Falls back to a plain message when the model returns no
 *   events.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { asArray, type Timeline, type TimelineEvent } from "../api/studio-api";

export function TimelineView({ data }: { data: Timeline }) {
  const events = asArray<TimelineEvent>(data.events).filter((e) => e && typeof e === "object");
  if (events.length === 0) {
    return <p className="text-sm text-text-3">The timeline came back empty. Try a broader focus.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-6 font-display text-lg font-bold text-text-1">{data.title}</h2>
      <ol className="relative space-y-6 border-l border-border pl-6">
        {events.map((event, i) => (
          <li key={i} className="relative">
            <span
              className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-bg"
              aria-hidden
            />
            <p className="font-mono text-xs uppercase tracking-wider text-accent">{event.date}</p>
            <h3 className="mt-0.5 font-display text-sm font-bold text-text-1">{event.title}</h3>
            <p className="mt-1 font-body text-sm leading-relaxed text-text-2">{event.description}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
