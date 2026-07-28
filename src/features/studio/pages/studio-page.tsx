/*
 * Name: studio-page.tsx
 * Purpose: The Studio: turn a notebook's sources into study aids.
 * Description: Pick a format (study guide, flashcards, quiz, or mind map),
 *   optionally give a focus, and generate content grounded in the active
 *   notebook's documents. Each format renders in its own real, interactive
 *   view. Requires an active notebook with imported documents; every other
 *   state (no notebook, generating, empty result, malformed output) is handled
 *   with a plain, recoverable message rather than a dead end.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { useEffect } from "react";
import { Link } from "react-router";

import { ROUTES } from "@/lib/constants";
import { useNotebookStore } from "@/stores/notebook-store";
import { usePersistentDraft, useRetainedState } from "@/lib/use-persistent-draft";
import { ModelRequiredNotice } from "@/components/shared/model-required-notice";
import { NotebookScope } from "@/components/shared/notebook-scope";
import { SourcePicker } from "@/components/shared/source-picker";
import { JobProgress } from "@/components/shared/job-progress";
import { useJobRun } from "@/features/jobs/use-job-run";
import {
  safeJson,
  asItemArray,
  type StudioFormat,
  type Flashcard,
  type QuizQuestion,
  type MindMap,
  type Timeline,
  type SlideDeck,
  type DataTable,
} from "../api/studio-api";
import { StudyGuideView } from "../components/study-guide-view";
import { FlashcardsView } from "../components/flashcards-view";
import { QuizView } from "../components/quiz-view";
import { MindMapView } from "../components/mind-map-view";
import { TimelineView } from "../components/timeline-view";
import { SlideDeckView } from "../components/slide-deck-view";
import { DataTableView } from "../components/data-table-view";

const FORMATS: { id: StudioFormat; label: string; blurb: string }[] = [
  { id: "study_guide", label: "Study guide", blurb: "A structured overview with key terms and questions." },
  { id: "flashcards", label: "Flashcards", blurb: "Flip through the key facts and definitions." },
  { id: "quiz", label: "Quiz", blurb: "Test yourself with multiple-choice questions." },
  { id: "mind_map", label: "Mind map", blurb: "See how the main ideas connect." },
  { id: "timeline", label: "Timeline", blurb: "Lay the events out in the order they happened." },
  { id: "slide_deck", label: "Slide deck", blurb: "Walk the material as a deck of slides." },
  { id: "data_table", label: "Data table", blurb: "Organize the key facts into a table." },
  { id: "briefing", label: "Briefing doc", blurb: "A concise briefing for a busy reader." },
  { id: "blog_post", label: "Blog post", blurb: "An accessible write-up for a general audience." },
];

export function StudioPage() {
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const [format, setFormat] = useRetainedState<StudioFormat>(
    "notebooklab-state-studio-format",
    "study_guide",
  );
  /* Preserve the typed focus across navigation and reload. */
  const [focus, setFocus] = usePersistentDraft("notebooklab-draft-studio-focus");
  const [result, setResult] = useRetainedState<{ format: StudioFormat; text: string } | null>(
    "notebooklab-state-studio-result",
    null,
  );

  const [sources, setSources] = useRetainedState<string[]>("notebooklab-studio-sources", []);
  const run = useJobRun("generate_studio", "notebooklab-job-studio");

  /* The job holds the finished text; the retained copy is what survives the job
     history being trimmed, so a result stays on the page afterwards. */
  useEffect(() => {
    /* Safe to pair the result with the current format: picking a different
       format detaches from the job, so a result can only ever arrive for the
       format that started it. */
    if (run.result) setResult({ format, text: run.result });
  }, [run.result, format, setResult]);

  const generate = () =>
    void run.start({
      notebook_id: activeNotebookId,
      format,
      focus,
      document_ids: sources,
    });

  const pickFormat = (id: StudioFormat) => {
    setFormat(id);
    setResult(null);
    /* Detach from the previous format's job rather than cancelling it: the
       user may well come back to it, and it costs nothing to let it finish. */
    run.reset();
  };

  if (!activeNotebookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-text-3 p-8">
        <p className="text-lg mb-2">Open a notebook first</p>
        <p className="text-sm text-text-4 mb-6">The Studio works from the documents in a notebook.</p>
        <Link to={ROUTES.NOTEBOOKS} className="px-4 py-2 text-sm font-mono bg-primary text-on-primary">
          Go to Notebooks
        </Link>
      </div>
    );
  }

  const active = FORMATS.find((f) => f.id === format)!;
  const showResult = result && result.format === format;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-text-1 mb-1">Studio</h1>
      <NotebookScope />
      <p className="text-sm text-text-3 mb-8">
        Turn this notebook's sources into study aids. Everything is drawn from your own documents.
      </p>

      <ModelRequiredNotice action="The Studio" />

      {/* Format picker */}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Studio format">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={format === f.id}
            onClick={() => pickFormat(f.id)}
            className={`px-4 py-2 text-sm font-mono border transition-colors ${
              format === f.id
                ? "border-accent-dim text-text-1 bg-surface-2"
                : "border-border text-text-3 hover:text-text-1"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-4 mb-6">{active.blurb}</p>

      <SourcePicker
        notebookId={activeNotebookId}
        value={sources}
        onChange={setSources}
        disabled={run.isRunning}
      />

      {/* Focus + generate */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <input
          type="text"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !run.isRunning && generate()}
          placeholder="Focus (optional). Leave blank for the whole notebook."
          aria-label="Focus for generation"
          className="flex-1 px-3 py-2 text-sm bg-surface border border-border text-text-1
                     placeholder:text-text-4 outline-none focus:border-accent-dim"
        />
        <button
          type="button"
          onClick={generate}
          disabled={run.isRunning}
          className="px-5 py-2 text-sm font-mono bg-primary text-on-primary hover:bg-primary-hover
                     disabled:opacity-50 transition-colors"
        >
          {run.isRunning ? "Working..." : `Generate ${active.label.toLowerCase()}`}
        </button>
      </div>

      {/* Result */}
      <div className="min-h-[200px]">
        {run.job && run.job.status !== "done" && (
          <div className="mb-4">
            <JobProgress job={run.job} onCancel={run.cancel} />
          </div>
        )}
        {run.error && (
          <p role="alert" className="text-sm text-error">
            {run.error}
          </p>
        )}
        {showResult && !run.isRunning && <StudioResult format={format} text={result.text} />}
        {!showResult && !run.isRunning && !run.error && run.ready && (
          <p className="text-sm text-text-4">
            Choose a format above and generate it from this notebook.
          </p>
        )}
      </div>
    </div>
  );
}

/* Parse and render one result, turning a malformed model reply into a plain,
   recoverable message instead of a crash. Parsing happens in safeJson so no
   try/catch sits in the render path. */
function StudioResult({ format, text }: { format: StudioFormat; text: string }) {
  /* The study guide and the two report styles are Markdown. */
  if (format === "study_guide" || format === "briefing" || format === "blog_post") {
    return <StudyGuideView markdown={text} />;
  }
  if (format === "flashcards") {
    const parsed = safeJson<unknown>(text);
    if ("error" in parsed) return <ResultError message={parsed.error} />;
    const cards = asItemArray<Flashcard>(parsed.data);
    return cards ? <FlashcardsView cards={cards} /> : <ResultError message="The result could not be read." />;
  }
  if (format === "quiz") {
    const parsed = safeJson<unknown>(text);
    if ("error" in parsed) return <ResultError message={parsed.error} />;
    const questions = asItemArray<QuizQuestion>(parsed.data);
    return questions ? <QuizView questions={questions} /> : <ResultError message="The result could not be read." />;
  }
  if (format === "timeline") {
    const parsed = safeJson<Timeline>(text);
    return "error" in parsed ? <ResultError message={parsed.error} /> : <TimelineView data={parsed.data} />;
  }
  if (format === "slide_deck") {
    const parsed = safeJson<SlideDeck>(text);
    return "error" in parsed ? <ResultError message={parsed.error} /> : <SlideDeckView data={parsed.data} />;
  }
  if (format === "data_table") {
    const parsed = safeJson<DataTable>(text);
    return "error" in parsed ? <ResultError message={parsed.error} /> : <DataTableView data={parsed.data} />;
  }
  const parsed = safeJson<MindMap>(text);
  return "error" in parsed ? <ResultError message={parsed.error} /> : <MindMapView data={parsed.data} />;
}

function ResultError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-error">
      {message} Generate it again.
    </p>
  );
}
