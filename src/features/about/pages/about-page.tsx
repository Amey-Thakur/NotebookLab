/*
 * Name: about-page.tsx
 * Purpose: The people behind NotebookLab, why it exists, and the pledge they
 *   sign their names to.
 * Description: This is the app's first release to the public, and this page is
 *   the two makers speaking for themselves: portraits pulled live from GitHub,
 *   their own words, and the Makers' Pledge set as a certificate. The pledge
 *   uses the one shared certificate design, so it looks the same here, on the
 *   website, and in the download.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { MakersCertificate } from "../components/makers-certificate";
import { AuthorPortrait } from "../components/author-portrait";

const REPOSITORY_URL = "https://github.com/Amey-Thakur/NotebookLab";
const CERTIFICATE_URL =
  "https://raw.githubusercontent.com/Amey-Thakur/NotebookLab/main/site/makers-pledge.png";

interface Maker {
  name: string;
  handle: string;
  role: string;
  place: string;
  quote: string;
}

const MAKERS: Maker[] = [
  {
    name: "Amey Thakur",
    handle: "Amey-Thakur",
    role: "AI/ML Engineer and Research Scholar",
    place: "Canada",
    quote:
      "Every idea I open-source is a spark handed to someone I may never meet. That is the whole point.",
  },
  {
    name: "Archit Konde",
    handle: "Archit-Konde",
    role: "Machine Learning Engineer",
    place: "Waterloo, Ontario",
    quote: "Solving the intelligence problem, one step at a time.",
  },
];

export function AboutPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Why this exists */}
      <section className="mb-14">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-5 pb-2 border-b border-border">
          Why we built this
        </h2>
        <div className="space-y-4 font-body text-base text-text-2 leading-relaxed">
          <p>
            We wanted a place to think that belongs to no one but the person thinking.
            The tools we loved kept moving online, behind accounts and subscriptions,
            where every note travels through someone else&apos;s server. So we built the
            notebook we wished existed: one that reads your documents, answers your
            questions, and never sends a word off your machine.
          </p>
          <p>
            NotebookLab is the first software we have released to the public. We hope it
            grows. We hope people use it, love it, build on it, and let it earn a small
            place in how they work every day. That hope is why every line of it is open.
          </p>
        </div>
      </section>

      {/* The makers */}
      <section className="mb-14">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-5 pb-2 border-b border-border">
          The makers
        </h2>
        <div className="space-y-8">
          {MAKERS.map((maker) => (
            <article key={maker.handle} className="flex gap-5">
              <AuthorPortrait handle={maker.handle} name={maker.name} />
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-text-1">
                  <a
                    href={`https://github.com/${maker.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-accent transition-colors"
                  >
                    {maker.name}
                  </a>
                </h3>
                <p className="text-xs font-mono text-text-4 mb-2">
                  {maker.role} &middot; {maker.place}
                </p>
                <blockquote className="font-body italic text-sm text-text-2 leading-relaxed">
                  &ldquo;{maker.quote}&rdquo;
                </blockquote>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* The pledge, as the shared certificate */}
      <section className="mb-8">
        <MakersCertificate />
      </section>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center text-xs text-text-4">
        <a
          href={CERTIFICATE_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-text-2 transition-colors"
        >
          Download the certificate
        </a>
        <a
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-text-2 transition-colors"
        >
          Read the source on GitHub
        </a>
      </div>
    </div>
  );
}
