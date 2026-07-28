/*
 * Name: thinking-partner-page.tsx
 * Purpose: Thinking Partner page.
 * Description: Two modes: mind map generation from documents, and Socratic
 *   questioning to challenge the user's thinking. Requires an
 *   active notebook with imported documents. The mind map renders
 *   as a real visual tree through the shared Studio view; Socratic
 *   mode returns probing questions the user can reflect on.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useState } from "react";
import { Link } from "react-router";

import { ModelRequiredNotice } from "@/components/shared/model-required-notice";
import { NotebookScope } from "@/components/shared/notebook-scope";
import { SourcePicker } from "@/components/shared/source-picker";
import { JobProgress } from "@/components/shared/job-progress";
import { ROUTES } from "@/lib/constants";
import { useNotebookStore } from "@/stores/notebook-store";
import { useRetainedState } from "@/lib/use-persistent-draft";
import { useJobRun } from "@/features/jobs/use-job-run";
import { safeJson, type MindMap } from "@/features/studio/api/studio-api";
import { MindMapView } from "@/features/studio/components/mind-map-view";


type Mode = "mindmap" | "socratic";


export function ThinkingPartnerPage() {
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const [mode, setMode] = useRetainedState<Mode>("notebooklab-state-think-mode", "mindmap");
  const [input, setInput] = useState("");
  const [result, setResult] = useRetainedState<string | null>(
    "notebooklab-state-think-result",
    null,
  );

  /* One run per mode, each remembering its own job, so switching between Mind
     Map and Socratic does not detach from a generation that is still going. */
  const mindmap = useJobRun("generate_mind_map", "notebooklab-job-mindmap");
  const socratic = useJobRun("generate_socratic_questions", "notebooklab-job-socratic");
  const run = mode === "mindmap" ? mindmap : socratic;

  const [sources, setSources] = useRetainedState<string[]>(
    "notebooklab-think-sources",
    [],
  );

  /* A finished job is the source of truth; the retained copy is what survives
     the job history being cleared. */
  useEffect(() => {
    if (run.result) setResult(run.result);
  }, [run.result, setResult]);

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    setResult(null);
    void run.start(
      mode === "mindmap"
        ? { notebook_id: activeNotebookId, topic: text, document_ids: sources }
        : { notebook_id: activeNotebookId, thinking: text, document_ids: sources },
    );
  };

  if (!activeNotebookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-3 p-8">
        <p className="text-lg mb-2">No notebook selected</p>
        <p className="text-sm text-text-4 mb-4">Open a notebook first to use the Thinking Partner.</p>
        <Link
          to={ROUTES.NOTEBOOKS}
          className="px-4 py-2 text-sm font-mono border border-border text-text-2 hover:border-accent-dim transition-colors"
        >
          Go to Notebooks
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4">
        <h1 className="text-2xl font-display font-bold text-text-1 mb-1">Thinking Partner</h1>
        <NotebookScope />

        <ModelRequiredNotice action="The thinking partner" />

        {/* Mode toggle */}
        <div className="flex gap-1 mb-4" role="group" aria-label="Thinking mode">
          {([["mindmap", "Mind Map"], ["socratic", "Socratic"]] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => { setMode(m); setResult(null); }}
              className={`px-4 py-2 text-sm font-mono border transition-colors ${
                mode === m
                  ? "border-accent-dim text-text-1 bg-surface-2"
                  : "border-border text-text-3 hover:text-text-1"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <SourcePicker
          notebookId={activeNotebookId}
          value={sources}
          onChange={setSources}
          disabled={run.isRunning}
        />

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={mode === "mindmap" ? "Topic for mind map..." : "Describe your current thinking..."}
            aria-label={mode === "mindmap" ? "Topic for mind map" : "Describe your current thinking"}
            className="flex-1 px-4 py-3 text-sm bg-surface border border-border text-text-1
                       placeholder:text-text-4 outline-none focus:border-accent-dim"
          />
          <button
            type="button"
            onClick={submit}
            disabled={run.isRunning || !input.trim()}
            className="px-4 py-3 text-sm font-mono bg-primary text-on-primary disabled:opacity-50"
          >
            {mode === "mindmap" ? "Generate" : "Ask"}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto px-8 py-4">
        {run.job && run.job.status !== "done" && (
          <div className="mb-4">
            <JobProgress job={run.job} onCancel={run.cancel} />
          </div>
        )}

        {run.error && (
          <div role="alert" className="p-3 border border-error text-xs text-error">
            {run.error}
          </div>
        )}

        {result && (
          <div className="p-6 border border-border bg-surface">
            <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-4">
              {mode === "mindmap" ? "Mind Map" : "Socratic Questions"}
            </h2>
            {mode === "mindmap" ? (
              <MindMapResult text={result} />
            ) : (
              <pre className="text-sm font-body text-text-2 whitespace-pre-wrap leading-relaxed">
                {result}
              </pre>
            )}
          </div>
        )}

        {!result && !run.job && run.ready && (
          <div className="flex items-center justify-center h-full text-text-4">
            <p className="text-sm">
              {mode === "mindmap"
                ? "Enter a topic to generate a mind map from your documents."
                : "Describe what you're thinking about and get probing questions."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* Parse the generated mind map and draw it, falling back to a plain message if
   the model's reply was not usable. Parsing is in safeJson so no try/catch
   sits in the render path. */
function MindMapResult({ text }: { text: string }) {
  const parsed = safeJson<MindMap>(text);
  if ("error" in parsed) {
    return (
      <p role="alert" className="text-sm text-error">
        {parsed.error} Generate it again.
      </p>
    );
  }
  return <MindMapView data={parsed.data} />;
}
