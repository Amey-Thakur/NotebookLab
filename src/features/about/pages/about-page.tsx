/*
 * Name: about-page.tsx
 * Purpose: The people behind NotebookLab, why it exists, and the pledge they
 *   sign their names to.
 * Description: This is the app's first release to the public, and this page is
 *   the two makers speaking for themselves: portraits pulled live from GitHub,
 *   their own words, and a certificate carrying the fingerprint of the key
 *   that signs every commit and release, so the promise on screen is checkable
 *   against the repository itself.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { AuthorPortrait } from "../components/author-portrait";

/* The fingerprint of the SSH key that signs every commit and release in the
   NotebookLab repository. Printed on the pledge so the signature below is a
   claim anyone can verify, not a decoration. */
const RELEASE_KEY_FINGERPRINT = "SHA256:h+W7L5p+iSLNi8FfG+Svgwtr/shv3l0JsCYq/o6VBis";

const REPOSITORY_URL = "https://github.com/Amey-Thakur/NotebookLab";

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
  const { data: version } = useQuery({
    queryKey: [QUERY_KEYS.SETTINGS, "version"],
    queryFn: () => tauriInvoke<string>("get_app_version"),
  });

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Wordmark */}
      <div className="mb-12 text-center">
        <h1 className="font-display text-3xl font-bold text-text-1 mb-1">NotebookLab</h1>
        <p className="text-xs font-mono text-text-4">
          {version ? `Version ${version}` : " "}
        </p>
      </div>

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

      {/* The pledge, set like a certificate */}
      <section className="mb-10">
        <div className="border border-border p-1.5">
          <div className="border border-accent-dim px-8 py-10 text-center">
            <p className="text-2xs font-mono tracking-[3px] uppercase text-text-4 mb-3">
              Certificate of Authenticity
            </p>
            <h2 className="font-display text-xl font-bold text-text-1 mb-8">
              The Makers&apos; Pledge
            </h2>

            <div className="font-body text-sm text-text-2 leading-relaxed max-w-md mx-auto space-y-4 text-left">
              <p>
                We built NotebookLab with our own hands, and we stand behind every line
                of it. To everyone who trusts it with their thinking, we promise:
              </p>
              <ul className="space-y-2 list-none">
                <li>
                  Your work stays on your machine. No telemetry, no tracking, no quiet
                  network calls.
                </li>
                <li>The source stays open, for anyone to read, question, and build upon.</li>
                <li>We ship nothing we would not use ourselves.</li>
                <li>When we get something wrong, we will say so plainly and fix it.</li>
              </ul>
            </div>

            {/* Signatures */}
            <div className="flex justify-center gap-12 mt-10 mb-8">
              {MAKERS.map((maker) => (
                <div key={maker.handle} className="text-center">
                  <p className="font-body italic text-lg text-text-1 mb-2">{maker.name}</p>
                  <div className="border-t border-border pt-1.5">
                    <p className="text-2xs font-mono text-text-4">@{maker.handle}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-2xs font-mono text-text-4 leading-relaxed">
              First released to the public in 2026 &middot; MIT License
              <br />
              Every commit and release is signed with the project key
              <br />
              <span className="text-text-3 break-all">{RELEASE_KEY_FINGERPRINT}</span>
            </p>
          </div>
        </div>
      </section>

      <p className="text-center text-xs text-text-4">
        <a
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-text-2 transition-colors"
        >
          Read the source on GitHub
        </a>
      </p>
    </div>
  );
}
