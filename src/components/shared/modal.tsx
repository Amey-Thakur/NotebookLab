/*
 * Name: modal.tsx
 * Purpose: One accessible dialog primitive for the app's overlays.
 * Description: Overlays were hand-rolled per feature, so focus handling and
 *   escape behavior drifted between them. This is the shared shell: a centered
 *   panel over a scrim that closes on Escape or a backdrop click, traps Tab
 *   focus while open, and returns focus to wherever it came from on close.
 *   It mounts only while open so each appearance starts clean, and its entrance
 *   animation stands down for reduced-motion users.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog, read by screen readers. */
  label: string;
  children: ReactNode;
  /** Tailwind max-width class for the panel. Defaults to a comfortable reading width. */
  widthClassName?: string;
  /** Vertical placement: centered (default) or anchored near the top. */
  align?: "center" | "top";
}

export function Modal(props: ModalProps) {
  /* Mount only while open so focus capture and listeners reset every time */
  if (!props.open) return null;
  return <ModalContent {...props} />;
}

function ModalContent({ onClose, label, children, widthClassName, align = "center" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /* Capture focus on open and give it back to the opener on close, so keyboard
     users are never dropped at the top of the page when a dialog dismisses. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  /* Escape closes from anywhere, even if focus has left the panel */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Keep Tab inside the dialog. Cycles between the first and last focusable
     controls so focus cannot wander back to the page behind the scrim. */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) {
      /* Nothing to move to; keep focus parked on the panel */
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    /* Right after opening, the panel itself holds focus. It sits outside the
       focusable list, so treat it as the trap's edge: Tab enters at the first
       control and Shift+Tab wraps to the last instead of escaping the scrim. */
    if (active === panelRef.current) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center bg-black/40 px-4 motion-safe:animate-fade-in",
        align === "center" ? "items-center" : "items-start pt-[14vh]",
      )}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full bg-surface border border-border shadow-xl outline-none motion-safe:animate-scale-in",
          widthClassName ?? "max-w-lg",
        )}
      >
        {children}
      </div>
    </div>
  );
}
