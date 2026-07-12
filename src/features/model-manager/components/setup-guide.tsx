/*
 * Title: setup-guide.tsx
 * Tech Stack: React 19, Tailwind CSS
 * Description: One-click setup guide for users who don't have an AI provider yet.
 *   Shows step-by-step instructions for installing Ollama with a single download link.
 * Important Details: Shown on the Models page when no providers are registered.
 *   Provides a direct download link and the exact terminal command to run.
 *   "Check for providers" re-runs the real endpoint probe (detect_providers),
 *   not just a cache refresh, so a freshly started Ollama is found immediately.
 */


interface SetupGuideProps {
  onDetect: () => void;
  isDetecting: boolean;
}


export function SetupGuide({ onDetect, isDetecting }: SetupGuideProps) {
  return (
    <div className="border border-accent-dim bg-surface-2 p-6 mb-8">
      <h2 className="text-lg font-display font-bold text-text-1 mb-2">
        Get AI running in 3 steps
      </h2>
      <p className="text-sm text-text-3 mb-6">
        NotebookLab needs a local AI model to power chat, search, and thinking features.
        Ollama is the easiest way to run AI on your machine.
      </p>

      <div className="space-y-4">
        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-xs font-mono font-bold bg-accent-dim text-text-1">
            1
          </span>
          <div>
            <p className="text-sm font-semibold text-text-1">Download Ollama</p>
            <p className="text-xs text-text-3 mt-1">
              Visit{" "}
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                ollama.com/download
              </a>{" "}
              and install it for your platform.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-xs font-mono font-bold bg-accent-dim text-text-1">
            2
          </span>
          <div>
            <p className="text-sm font-semibold text-text-1">Pull a model</p>
            <p className="text-xs text-text-3 mt-1">
              Open a terminal and run:
            </p>
            <code className="block mt-1 px-3 py-2 text-xs font-mono bg-surface border border-border text-accent">
              ollama pull llama3.2:3b
            </code>
          </div>
        </div>

        <div className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-xs font-mono font-bold bg-accent-dim text-text-1">
            3
          </span>
          <div>
            <p className="text-sm font-semibold text-text-1">Come back here</p>
            <p className="text-xs text-text-3 mt-1">
              NotebookLab auto-detects Ollama on startup. Click below to check now.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onDetect}
        disabled={isDetecting}
        className="mt-6 px-4 py-2 text-sm font-mono bg-accent-dim text-text-1
                   hover:bg-accent transition-colors disabled:opacity-50"
      >
        {isDetecting ? "Checking..." : "Check for providers"}
      </button>
    </div>
  );
}
