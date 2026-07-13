/*
 * Name: study-guide-view.tsx
 * Purpose: Render the generated study guide from Markdown.
 * Description: A small, safe Markdown reader for the handful of shapes the
 *   study-guide prompt actually produces: headings, bullet lists, paragraphs,
 *   and bold runs. It builds React elements directly and never sets raw HTML,
 *   so model output cannot inject markup. Styled with the app's serif body and
 *   display headings so a guide reads like the rest of the app.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import type { ReactNode } from "react";

/* Split a line into plain and bold runs. Bold is delimited by **. */
function inline(text: string): ReactNode[] {
  return text.split(/\*\*/).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-text-1">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function StudyGuideView({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    const items = [...list];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1.5 font-body text-sm text-text-2">
        {items.map((item, i) => (
          <li key={i}>{inline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw) => {
    const line = raw.trim();
    if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ""));
      return;
    }
    flushList();
    if (/^###\s+/.test(line)) {
      blocks.push(
        <h4 key={`h-${blocks.length}`} className="font-display text-sm font-bold text-text-1 pt-2">
          {inline(line.replace(/^###\s+/, ""))}
        </h4>,
      );
    } else if (/^##\s+/.test(line)) {
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="font-display text-base font-bold text-text-1 pt-3">
          {inline(line.replace(/^##\s+/, ""))}
        </h3>,
      );
    } else if (/^#\s+/.test(line)) {
      blocks.push(
        <h2 key={`h-${blocks.length}`} className="font-display text-lg font-bold text-text-1 pt-3">
          {inline(line.replace(/^#\s+/, ""))}
        </h2>,
      );
    } else if (line) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="font-body text-sm text-text-2 leading-relaxed">
          {inline(line)}
        </p>,
      );
    }
  });
  flushList();

  return <div className="max-w-2xl mx-auto space-y-3">{blocks}</div>;
}
