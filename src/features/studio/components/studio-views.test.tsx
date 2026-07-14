/*
 * Name: studio-views.test.tsx
 * Purpose: Render-safety tests for the new Studio views.
 * Description: Renders the timeline, slide deck, and data table to markup with
 *   sample data and checks the output, including a short table row and empty
 *   data. Catches a render crash in CI without the desktop runtime.
 * Tech Stack: Vitest, react-dom/server
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { TimelineView } from "./timeline-view";
import { SlideDeckView } from "./slide-deck-view";
import { DataTableView } from "./data-table-view";
import { QuizView } from "./quiz-view";
import { FlashcardsView } from "./flashcards-view";
import { MindMapView } from "./mind-map-view";
import { asArray, asItemArray } from "../api/studio-api";

describe("Studio views", () => {
  it("TimelineView renders events", () => {
    const markup = renderToStaticMarkup(
      <TimelineView
        data={{ title: "History", events: [{ date: "1990", title: "Start", description: "It began." }] }}
      />,
    );
    expect(markup).toContain("History");
    expect(markup).toContain("1990");
    expect(markup).toContain("Start");
  });

  it("SlideDeckView renders the first slide and a counter", () => {
    const markup = renderToStaticMarkup(
      <SlideDeckView
        data={{
          title: "Deck",
          slides: [
            { title: "Intro", bullets: ["a", "b"] },
            { title: "Two", bullets: ["c"] },
          ],
        }}
      />,
    );
    expect(markup).toContain("Intro");
    expect(markup).toContain("1 / 2");
  });

  it("DataTableView renders columns and cells, tolerating a short row", () => {
    const markup = renderToStaticMarkup(
      <DataTableView data={{ title: "T", columns: ["A", "B"], rows: [["x", "y"], ["z"]] }} />,
    );
    expect(markup).toContain("A");
    expect(markup).toContain("x");
    expect(markup).toContain("z");
  });

  it("empty results fall back to a plain message", () => {
    expect(renderToStaticMarkup(<TimelineView data={{ title: "T", events: [] }} />)).toContain("empty");
    expect(
      renderToStaticMarkup(<DataTableView data={{ title: "T", columns: [], rows: [] }} />),
    ).toContain("empty");
  });
});

describe("array guards", () => {
  it("asArray coerces non-arrays to empty", () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray({})).toEqual([]);
    expect(asArray(null)).toEqual([]);
    expect(asArray("x")).toEqual([]);
  });

  it("asItemArray recovers a wrapped array or reports nothing usable", () => {
    expect(asItemArray([1])).toEqual([1]);
    expect(asItemArray({ questions: [1, 2] })).toEqual([1, 2]);
    expect(asItemArray({})).toBeNull();
    expect(asItemArray("x")).toBeNull();
  });
});

describe("Studio views tolerate malformed model output", () => {
  /* A model can return the wrong shape; a view must degrade, never crash. Each
     render below would throw before the guards were added. */
  const bad = (node: () => string) => expect(node).not.toThrow();

  it("does not crash on mistyped or null-laden data", () => {
    // Non-array fields where an array is expected.
    bad(() => renderToStaticMarkup(<TimelineView data={{ title: "T", events: {} as never }} />));
    bad(() => renderToStaticMarkup(<SlideDeckView data={{ title: "T", slides: "no" as never }} />));
    bad(() =>
      renderToStaticMarkup(<DataTableView data={{ title: "T", columns: "no" as never, rows: 5 as never }} />),
    );
    bad(() => renderToStaticMarkup(<MindMapView data={{ title: "T", branches: {} as never }} />));
    bad(() => renderToStaticMarkup(<FlashcardsView cards={{} as never} />));
    bad(() => renderToStaticMarkup(<QuizView questions={{} as never} />));

    // Well-typed containers with malformed items.
    bad(() =>
      renderToStaticMarkup(
        <SlideDeckView data={{ title: "T", slides: [null as never, { title: "s", bullets: "x" as never }] }} />,
      ),
    );
    bad(() =>
      renderToStaticMarkup(
        <DataTableView data={{ title: "T", columns: ["A", "B"], rows: [null as never, "x" as never] }} />,
      ),
    );
    bad(() =>
      renderToStaticMarkup(
        <QuizView questions={[{ question: "q" } as never, { question: "q2", options: ["a", "b"], answer: 0, explanation: "e" }]} />,
      ),
    );
    bad(() =>
      renderToStaticMarkup(
        <MindMapView data={{ title: "T", branches: [{} as never, { label: "b", children: "no" as never }] }} />,
      ),
    );

    // Null items inside otherwise-valid arrays (common in truncated model JSON).
    bad(() =>
      renderToStaticMarkup(
        <TimelineView
          data={{ title: "T", events: [{ date: "1990", title: "a", description: "b" }, null as never] }}
        />,
      ),
    );
    bad(() =>
      renderToStaticMarkup(
        <MindMapView
          data={{ title: "T", branches: [{ label: "b", children: [{ label: "c" }, null as never] }, null as never] }}
        />,
      ),
    );
  });
});
