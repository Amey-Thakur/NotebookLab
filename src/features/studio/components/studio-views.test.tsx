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
