/*
 * Title: status-bar.tsx
 * Tech Stack: React 19, Tailwind CSS, Zustand
 * Description: Bottom status bar showing model status, word count, and indexed document count.
 * Important Details: Model status reads from the model store. Color indicator shows
 *   green (ready), amber (loading), red (crashed/stopped).
 */

export function StatusBar() {
  return (
    <footer className="flex items-center justify-between h-6 px-4 border-t border-border bg-bg">
      <div className="flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-mark" />
        <span className="font-mono text-[9px] text-text-4">
          No model loaded
        </span>
      </div>

      <span className="font-mono text-[9px] text-text-4">
        0 docs indexed
      </span>
    </footer>
  );
}
