/*
 * Name: makers-certificate.tsx
 * Purpose: The Makers' Pledge, rendered as one framed certificate.
 * Description: This is the single certificate design used everywhere the pledge
 *   appears: the app, the website, and the downloadable picture all show the
 *   same frame, the same logo, the same words, and the same verification seal,
 *   so the promise reads the same wherever it is met. The text is real and
 *   selectable for screen readers, and every color comes from the theme tokens
 *   so it stays readable in light and dark alike.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { BrandMark } from "@/components/shared/brand-mark";

const FINGERPRINT = "SHA256:h+W7L5p+iSLNi8FfG+Svgwtr/shv3l0JsCYq/o6VBis";

const SIGNERS = [
  { name: "Amey Thakur", handle: "Amey-Thakur" },
  { name: "Archit Konde", handle: "Archit-Konde" },
];

const PROMISES = [
  {
    title: "Yours alone.",
    body: "Your notes, documents, and questions never leave this machine. No accounts, no telemetry, no quiet calls home.",
  },
  {
    title: "Open always.",
    body: "Every line is here to be read, questioned, and made better by anyone who cares to look.",
  },
  {
    title: "Honest work.",
    body: "We ship only what we run ourselves, and when we get something wrong we say so plainly and fix it in the open.",
  },
];

export function MakersCertificate() {
  return (
    <div className="border border-accent-dim p-1.5">
      <div className="relative border border-accent-dim px-6 py-12 text-center sm:px-12">
        <CornerMarks />

        <div className="flex justify-center">
          <BrandMark className="h-14 w-14" />
        </div>
        <p className="mt-4 font-display text-2xl font-bold">
          <span className="text-text-1">Notebook</span>
          <span className="text-accent">Lab</span>
        </p>

        <p className="mt-5 text-2xs font-mono uppercase tracking-[3px] text-accent">
          Certificate of Authenticity
        </p>
        <div className="mx-auto my-3 h-px w-16 bg-accent-dim" />
        <h2 className="font-display text-2xl font-bold text-text-1">The Makers&apos; Pledge</h2>

        <div className="mx-auto mt-8 max-w-md space-y-5 font-body text-sm leading-relaxed text-text-2">
          <p>
            The tools we think with have quietly become products that watch us. The notebook
            turned into a subscription, the private note into a data point, and the quiet
            place to work into something that studies what you do inside it. We wanted our
            thinking partner back, so we built one that answers only to you.
          </p>
          <p>
            Every part of NotebookLab was made by the two of us, by hand, one considered
            commit at a time, each with a single clear purpose and read closely before it was
            trusted. We made it the way we would want a tool made for us.
          </p>
        </div>

        <p className="mx-auto mt-6 max-w-md font-body text-sm text-text-3">
          To everyone who makes it part of their work, we give our word.
        </p>

        <dl className="mx-auto mt-8 max-w-md space-y-5">
          {PROMISES.map((promise) => (
            <div key={promise.title}>
              <dt className="font-display text-base font-bold text-accent">{promise.title}</dt>
              <dd className="mt-1 font-body text-sm leading-relaxed text-text-2">{promise.body}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 flex flex-wrap justify-center gap-x-14 gap-y-6">
          {SIGNERS.map((signer) => (
            <div key={signer.handle} className="text-center">
              <p className="font-body text-lg italic text-text-1">{signer.name}</p>
              <div className="mt-2 border-t border-border pt-1.5">
                <p className="text-2xs font-mono text-text-4">@{signer.handle}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <VerificationSeal />
        </div>

        <p className="mx-auto mt-8 max-w-md font-body text-xs leading-relaxed text-text-3">
          Signed with our own hands, and with the key that signs every commit and release, so
          this promise can be checked and not merely trusted.
        </p>
        <p className="mt-4 text-2xs font-mono leading-relaxed text-text-4">
          First released to the public in 2026 &middot; MIT License
          <br />
          <span className="break-all text-accent">{FINGERPRINT}</span>
        </p>
      </div>
    </div>
  );
}

/* Small diamonds seated exactly on the inner frame's corners. The 10px square
   is offset by half its size so its center sits on the corner, matching the
   website and the downloadable certificate to the pixel. */
function CornerMarks() {
  const corner = "absolute h-2.5 w-2.5 rotate-45 bg-accent";
  return (
    <>
      <span aria-hidden="true" className={`${corner} -left-[5px] -top-[5px]`} />
      <span aria-hidden="true" className={`${corner} -right-[5px] -top-[5px]`} />
      <span aria-hidden="true" className={`${corner} -bottom-[5px] -left-[5px]`} />
      <span aria-hidden="true" className={`${corner} -bottom-[5px] -right-[5px]`} />
    </>
  );
}

/* The verification mark: a sealed check the pledge is signed */
function VerificationSeal() {
  return (
    <span
      className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-accent"
      aria-hidden="true"
    >
      <span className="absolute h-[76px] w-[76px] rounded-full border border-accent-dim" />
      <span className="flex flex-col items-center">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
          <path d="M5 12.5l4.2 4.5L19 6.5" />
        </svg>
        <span className="mt-1 text-[7px] font-mono uppercase tracking-[2px] text-accent">Signed</span>
      </span>
    </span>
  );
}
