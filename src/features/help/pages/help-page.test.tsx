/*
 * Name: help-page.test.tsx
 * Purpose: Render-safety test for the in-app guide.
 * Description: Renders the Help page to markup and checks that the guide is
 *   present and covers the recently added features, so a broken guide is caught
 *   in CI.
 * Tech Stack: Vitest, react-dom/server
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { HelpPage } from "./help-page";

describe("HelpPage", () => {
  it("renders the guide with the current features", () => {
    const markup = renderToStaticMarkup(<HelpPage />);
    expect(markup).toContain("Guide");
    for (const topic of ["The Studio", "Canvas", "Audio Studio", "Sharing a notebook", "OCR"]) {
      expect(markup).toContain(topic);
    }
    /* The on-this-page list links to every section anchor. */
    expect(markup).toContain('href="#canvas"');
    expect(markup).toContain('href="#sharing"');
  });
});
