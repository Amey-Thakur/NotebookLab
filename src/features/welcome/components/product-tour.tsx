/*
 * Name: product-tour.tsx
 * Purpose: A guided "how it works" tour that points at the real UI.
 * Description: Walks a new user through where things are with coach-mark
 *   tooltips: each step spotlights a target element (found by its data-tour
 *   attribute) by dimming everything else, and shows a titled tooltip beside it
 *   with Back, Next, and Skip. Runs once after the welcome on a fresh install
 *   and can be replayed from Settings. Targets that are not on screen fall back
 *   to a centered card, so the tour never breaks. Escape or Skip ends it; arrow
 *   keys move between steps.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-14
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router";

import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface TourStep {
  target: string;
  title: string;
  body: string;
  placement: "right" | "bottom" | "top";
}

const STEPS: TourStep[] = [
  {
    target: "sidebar",
    title: "Your navigation",
    body: "Everything lives here, grouped into Library for your content, Tools for the AI features, and System for setup. Collapse it to an icon rail anytime with the toggle at the bottom. Let's walk through each part.",
    placement: "right",
  },
  {
    target: "nav-home",
    title: "Home base",
    body: "Home greets you and offers quick actions (write, import, ask, search), with your recent notes and notebooks so you can pick up where you left off.",
    placement: "right",
  },
  {
    target: "nav-notebooks",
    title: "Notebooks hold your work",
    body: "A notebook groups sources, notes, and one canvas. Create them here, and share one as a single self-contained file with Export, or bring one in with Import. Ctrl+N starts a new note in the open notebook.",
    placement: "right",
  },
  {
    target: "nav-documents",
    title: "Bring in your sources",
    body: "Import PDFs, Word files, text, Markdown, and even images into a notebook. Photos and scans are read with offline OCR, so their text becomes searchable too. You can also drag a file straight onto the window.",
    placement: "right",
  },
  {
    target: "nav-search",
    title: "Search your notebook",
    body: "Search across the open notebook's documents and notes at once. Every result is tied back to the source it came from.",
    placement: "right",
  },
  {
    target: "nav-connections",
    title: "See how notes connect",
    body: "Link notes by typing [[a note's name]] while writing. Connections draws those links as a 3D map you can rotate, zoom, and click through (a flat view is one click away), and the AI is handed the same map so it knows how your work fits together.",
    placement: "right",
  },
  {
    target: "nav-chat",
    title: "Chat with your sources",
    body: "Ask a question and get an answer grounded in your documents, with citations you can open and check. Drag a file onto Chat to add it as a source first. Past conversations wait in the side rail.",
    placement: "right",
  },
  {
    target: "nav-think",
    title: "Think it through",
    body: "Your thinking partner turns your documents into a visual mind map, or switches to Socratic mode to ask probing questions that push your reasoning further.",
    placement: "right",
  },
  {
    target: "nav-studio",
    title: "The Studio",
    body: "Turn a notebook's sources into study aids and write-ups: a study guide, flashcards, a quiz, a mind map, a timeline, a slide deck, a data table, a briefing, or a blog post, each in its own view.",
    placement: "right",
  },
  {
    target: "nav-canvas",
    title: "A canvas per notebook",
    body: "A freeform whiteboard for visual thinking: draw with a pressure pen, add shapes and text, drop in images, and pan and zoom. It autosaves as you go.",
    placement: "right",
  },
  {
    target: "nav-transform",
    title: "Transform documents",
    body: "Run a document through a quick AI pass: summarize it, pull out its key points, or apply your own custom instruction, then copy the result.",
    placement: "right",
  },
  {
    target: "nav-audio",
    title: "Audio overview",
    body: "Turn a notebook into a spoken overview, read aloud in the app: a two-host discussion, a one-minute brief, a debate, or a critique.",
    placement: "right",
  },
  {
    target: "nav-prompt",
    title: "Prompt Studio",
    body: "Describe a job in plain words and it writes a complete, ready-to-run prompt for any AI model, turning unknowns into fill-in-the-blank variables. Or compose one from classic building blocks.",
    placement: "right",
  },
  {
    target: "nav-models",
    title: "Connect your AI: start here",
    body: "The AI features need a model. Models offers three paths: the bundled offline model, one-click installs of open models through Ollama, or a cloud provider (Anthropic, OpenAI, Gemini, DeepSeek) with your own API key. It's the first stop.",
    placement: "right",
  },
  {
    target: "nav-settings",
    title: "Make it yours",
    body: "Set your name and theme, find your data folder, browse every keyboard shortcut, manage the local API, and replay this tour whenever you like.",
    placement: "right",
  },
  {
    target: "nav-help",
    title: "Help and About",
    body: "Help is the full guide to NotebookLab, readable entirely offline. About introduces the two makers and the Makers' Pledge behind the app.",
    placement: "right",
  },
  {
    target: "model-switcher",
    title: "Your model, one click away",
    body: "This always shows which AI model is doing the work. Click it to switch between local and cloud models instantly, search them, and pin the ones you use most.",
    placement: "bottom",
  },
  {
    target: "search",
    title: "Jump anywhere, fast",
    body: "Press Ctrl+K (Cmd+K on Mac) to open the command palette and jump to any page, notebook, or action. Or press G then a letter (try G then H for Home), and ? for the full shortcut list.",
    placement: "bottom",
  },
  {
    target: "status",
    title: "Activity at a glance",
    body: "This dot reads the app's pulse: amber when no model is connected, green when one is ready, and a pulsing accent labelled Thinking while work is running. Once the AI has done anything, a live token counter appears on the right; click it for the per-model breakdown.",
    placement: "top",
  },
  {
    target: "",
    title: "Your work saves itself",
    body: "You never press save. Notes and the canvas autosave as you type and again the moment you leave the page, and Ctrl+S saves the open note right away. A small Saved indicator confirms it, so nothing you write is lost.",
    placement: "bottom",
  },
  {
    target: "",
    title: "You're all set",
    body: "We left a Getting Started notebook with sample notes and documents. Open it and try Chat, the Studio, or a transform on real content. You can replay this tour anytime from Settings.",
    placement: "bottom",
  },
];

const TOOLTIP_WIDTH = 300;
const GAP = 14;
const PAD = 6;

interface ProductTourProps {
  open: boolean;
  onFinish: () => void;
  /** Called from the final step to open the sample notebook, if provided. */
  onOpenSample?: () => void;
}

export function ProductTour({ open, onFinish, onOpenSample }: ProductTourProps) {
  /* Mounted fresh each time the tour opens (see AppShell), so step starts at 0
     without a reset effect. */
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const navigate = useNavigate();

  /* The opening steps describe Home, so the tour must start there. Without
     this, replaying from Settings spotlights "Home base" while a notebook or
     the settings page stays on screen, and the walkthrough reads as broken. */
  useEffect(() => {
    if (open) navigate(ROUTES.HOME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) {
      onFinish();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, onFinish]);

  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const measure = useCallback(() => {
    if (!open) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = el.getBoundingClientRect();
      /* Off-screen or zero-size (collapsed drawer): fall back to a centered card. */
      setRect(r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 ? r : null);
    } else {
      setRect(null);
    }
  }, [open, step]);

  useLayoutEffect(() => {
    /* Reading the target's box after layout to place the tooltip means storing
       it in state; the resulting re-render is bounded, not a loop. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
  }, [measure]);

  useEffect(() => {
    if (!open) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onFinish();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, onFinish]);

  if (!open || !current) return null;

  const tip = tooltipPosition(rect, current.placement);

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="How it works">
      {/* Spotlight: a hole around the target dims the rest of the screen. When
          there is no target, a plain dim backdrop with a centered card. */}
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-md ring-2 ring-accent"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
      )}

      {/* A transparent layer captures clicks so the app is not interacted with
          mid-tour; the tooltip sits above it. */}
      <div className="absolute inset-0" onClick={onFinish} aria-hidden="true" />

      <div
        className="absolute w-[300px] max-w-[calc(100vw-24px)] border border-border bg-surface shadow-xl"
        style={{ top: tip.top, left: tip.left }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-4">
          <p className="mb-1 font-mono text-2xs uppercase tracking-widest text-text-4">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="mb-1.5 font-display text-base font-bold text-text-1">{current.title}</h2>
          <p className="font-body text-sm leading-relaxed text-text-2">{current.body}</p>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onFinish}
            className="font-mono text-xs text-text-4 transition-colors hover:text-text-2"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="border border-border px-3 py-1.5 font-mono text-xs text-text-3
                           transition-colors hover:border-border-hover hover:text-text-1"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={isLast && onOpenSample ? onOpenSample : next}
              className="bg-primary px-3 py-1.5 font-mono text-xs text-on-primary
                         transition-colors hover:bg-primary-hover"
            >
              {isLast ? (onOpenSample ? "Open Getting Started" : "Done") : "Next"}
            </button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 px-4 pb-3" aria-hidden="true">
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={cn(
                "h-1 rounded-full transition-all",
                index === step ? "w-4 bg-accent" : "w-1 bg-border",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* Place the tooltip beside the target per the step's placement, clamped to the
   viewport. With no target, center it. */
function tooltipPosition(
  rect: DOMRect | null,
  placement: TourStep["placement"],
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const estHeight = 210;

  if (!rect) {
    return { top: Math.max(12, vh / 2 - estHeight / 2), left: Math.max(12, vw / 2 - TOOLTIP_WIDTH / 2) };
  }

  let top: number;
  let left: number;
  if (placement === "right") {
    top = rect.top;
    left = rect.right + GAP;
  } else if (placement === "bottom") {
    top = rect.bottom + GAP;
    left = rect.left;
  } else {
    /* top */
    top = rect.top - estHeight - GAP;
    left = rect.left;
  }

  left = Math.min(Math.max(12, left), vw - TOOLTIP_WIDTH - 12);
  top = Math.min(Math.max(12, top), vh - estHeight - 12);
  return { top, left };
}
