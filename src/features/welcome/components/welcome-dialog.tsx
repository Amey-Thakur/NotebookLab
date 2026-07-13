/*
 * Name: welcome-dialog.tsx
 * Purpose: First-launch greeting that orients a new user in a few calm steps.
 * Description: A short, spacious walk-through shown once per install: what the
 *   app is, a look to settle on, the handful of keys that make it fast, and a
 *   way in. It writes nothing except the theme the user picks; finishing or
 *   skipping simply records that the welcome has been seen. Built on the shared
 *   Modal so focus, escape, and reduced-motion behavior come for free.
 * Tech Stack: React 19, React Router, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Modal } from "@/components/shared/modal";
import { KeyCaps } from "@/components/shared/key-caps";
import { BrandMark } from "@/components/shared/brand-mark";
import { ROUTES } from "@/lib/constants";
import { SHORTCUTS, type Shortcut } from "@/lib/shortcuts";
import { useTheme } from "@/components/providers/theme-context";
import { cn } from "@/lib/utils";

interface WelcomeDialogProps {
  open: boolean;
  /** Records that the welcome has been seen and closes it. */
  onFinish: () => void;
}

const STEP_COUNT = 4;

/* Announced to screen readers when the step changes; the visual dots below
   are decorative and hidden from assistive tech. */
const STEP_TITLES = ["Welcome to NotebookLab", "Make it yours", "Move fast", "You are ready"];

/* The keys worth knowing on day one, pulled from the shared registry so their
   labels stay honest if a binding ever changes. */
const HIGHLIGHT_IDS = ["command-palette", "keyboard-help", "go-notebooks", "new-note"];

export function WelcomeDialog({ open, onFinish }: WelcomeDialogProps) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const next = () => setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const finishInto = (route?: string) => {
    onFinish();
    if (route) navigate(route);
  };

  const isLast = step === STEP_COUNT - 1;

  return (
    <Modal open={open} onClose={onFinish} label="Welcome to NotebookLab" widthClassName="max-w-lg">
      <div className="px-8 pt-8 pb-6 min-h-[19rem] flex flex-col">
        {/* Step changes swap content under a still-focused button; this quiet
            status line is how a screen reader hears the move. */}
        <p className="sr-only" role="status">
          Step {step + 1} of {STEP_COUNT}: {STEP_TITLES[step]}
        </p>

        <div className="flex-1">
          {step === 0 && <WelcomeStep />}
          {step === 1 && <ThemeStep />}
          {step === 2 && <ShortcutsStep />}
          {step === 3 && <ReadyStep />}
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mt-6" aria-hidden="true">
          {Array.from({ length: STEP_COUNT }).map((_, index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                index === step ? "w-5 bg-accent" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-8 py-4 border-t border-border">
        <button
          type="button"
          onClick={() => finishInto()}
          className="text-xs font-mono text-text-4 hover:text-text-2 transition-colors"
        >
          Skip
        </button>

        <div className="flex items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="px-4 py-2 text-sm font-mono border border-border text-text-3
                         hover:text-text-1 hover:border-border-hover transition-colors"
            >
              Back
            </button>
          )}
          {isLast ? (
            <button
              type="button"
              onClick={() => finishInto(ROUTES.NOTEBOOKS)}
              className="px-4 py-2 text-sm font-mono bg-primary text-on-primary hover:bg-primary-hover
                         transition-colors"
            >
              Open my notebooks
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="px-4 py-2 text-sm font-mono bg-primary text-on-primary hover:bg-primary-hover
                         transition-colors"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function WelcomeStep() {
  return (
    <div className="text-center">
      <div className="flex justify-center mb-5">
        <BrandMark className="h-14 w-14" />
      </div>
      <h2 className="font-display text-2xl font-bold text-text-1 mb-3">Welcome to NotebookLab</h2>
      <p className="text-sm text-text-2 leading-relaxed max-w-sm mx-auto">
        A private workspace where your notes, documents, and a local AI think together.
        Everything runs on this machine, so nothing you write leaves it.
      </p>
    </div>
  );
}

function ThemeStep() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  return (
    <div className="text-center">
      <h2 className="font-display text-xl font-bold text-text-1 mb-2">Make it yours</h2>
      <p className="text-sm text-text-2 mb-6 max-w-sm mx-auto">
        Pick a look. You can change it any time from Settings.
      </p>
      <div className="flex justify-center gap-2" role="group" aria-label="Theme">
        {(["light", "dark", "system"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={theme === option}
            onClick={() => setTheme(option)}
            className={cn(
              "px-4 py-2 text-sm font-mono border transition-colors",
              theme === option
                ? "border-accent-dim text-text-1 bg-surface-2"
                : "border-border text-text-3 hover:text-text-1",
            )}
          >
            {option.charAt(0).toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-4 mt-3">Showing {resolvedTheme}</p>
    </div>
  );
}

function ShortcutsStep() {
  const rows = HIGHLIGHT_IDS.map((id) => SHORTCUTS.find((s) => s.id === id)).filter(
    (s): s is Shortcut => Boolean(s),
  );
  return (
    <div>
      <h2 className="font-display text-xl font-bold text-text-1 mb-2 text-center">Move fast</h2>
      <p className="text-sm text-text-2 mb-6 max-w-sm mx-auto text-center">
        A few keys go a long way. Press{" "}
        <kbd className="font-mono text-xs text-text-2 bg-surface-2 border border-border px-1.5 py-0.5">?</kbd>{" "}
        any time to see them all.
      </p>
      <ul className="space-y-3 max-w-sm mx-auto">
        {rows.map((shortcut) => (
          <li key={shortcut.id} className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-2">{shortcut.description}</span>
            <KeyCaps keys={shortcut.keys} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadyStep() {
  return (
    <div className="text-center">
      <div className="flex justify-center mb-5">
        <BrandMark className="h-14 w-14" />
      </div>
      <h2 className="font-display text-xl font-bold text-text-1 mb-3">You are ready</h2>
      <p className="text-sm text-text-2 leading-relaxed max-w-sm mx-auto">
        We left a Getting Started notebook in place to explore. Drop in a PDF or Markdown file,
        write a note, and ask the AI what connects them.
      </p>
    </div>
  );
}
