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
    body: "Everything lives here, grouped into Library for your content, Tools for the AI features, and System. Collapse it anytime with the toggle at the bottom.",
    placement: "right",
  },
  {
    target: "nav-notebooks",
    title: "Notebooks hold your work",
    body: "Sources, notes, and a canvas live inside a notebook. We left a Getting Started notebook with sample notes and documents for you to try.",
    placement: "right",
  },
  {
    target: "nav-chat",
    title: "Chat with your documents",
    body: "Ask a question and get an answer grounded in your sources, with citations you can check.",
    placement: "right",
  },
  {
    target: "nav-studio",
    title: "The Studio",
    body: "Turn a notebook's sources into a study guide, quiz, timeline, slide deck, and more.",
    placement: "right",
  },
  {
    target: "search",
    title: "Find anything, fast",
    body: "Press Ctrl+K (Cmd+K on Mac) anywhere to jump to a page, a notebook, or an action.",
    placement: "bottom",
  },
  {
    target: "status",
    title: "Activity at a glance",
    body: "This dot shows when a model is loaded and lights up while the app is thinking or importing.",
    placement: "top",
  },
  {
    target: "",
    title: "You're all set",
    body: "We left a Getting Started notebook with sample notes and documents. Open it and try Chat, the Studio, or a transform. You can replay this tour anytime from Settings.",
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

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = useCallback(() => {
    setStep((s) => {
      if (s >= STEPS.length - 1) {
        onFinish();
        return s;
      }
      return s + 1;
    });
  }, [onFinish]);

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
        <div className="flex items-center justify-center gap-1.5 pb-3" aria-hidden="true">
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
