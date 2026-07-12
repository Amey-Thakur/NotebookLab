/*
 * Name: prompt-studio-page.tsx
 * Purpose: Build a clear, effective prompt from simple building blocks.
 * Description: The user fills in the parts of a good prompt (role, task,
 *   context, format, tone, constraints, examples) and the page composes them
 *   live into one clean prompt. Only the task is required; everything else is
 *   optional and simply omitted when blank, so the tool never pads the output
 *   with empty scaffolding. Copy takes the result anywhere, and "Refine with
 *   AI" asks the active model to sharpen it. This teaches prompt structure by
 *   showing it, rather than hiding it behind a black box.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { formatError } from "@/lib/format-error";


interface PromptParts {
  role: string;
  task: string;
  context: string;
  format: string;
  tone: string;
  constraints: string;
  examples: string;
}

const EMPTY: PromptParts = {
  role: "",
  task: "",
  context: "",
  format: "",
  tone: "",
  constraints: "",
  examples: "",
};

const FIELDS: Array<{
  key: keyof PromptParts;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { key: "role", label: "Role", placeholder: "e.g. an experienced research librarian" },
  { key: "task", label: "Task", placeholder: "The one thing you want done", multiline: true },
  { key: "context", label: "Context", placeholder: "Background the model needs", multiline: true },
  { key: "format", label: "Output format", placeholder: "e.g. a five-bullet summary" },
  { key: "tone", label: "Tone", placeholder: "e.g. plain and direct" },
  { key: "constraints", label: "Constraints", placeholder: "e.g. under 200 words, no jargon", multiline: true },
  { key: "examples", label: "Examples", placeholder: "One or two examples of what good looks like", multiline: true },
];


/* Compose the parts into a prompt, skipping every empty field */
function compose(parts: PromptParts): string {
  const lines: string[] = [];
  if (parts.role.trim()) lines.push(`You are ${parts.role.trim()}.`);
  if (parts.task.trim()) lines.push(`\nTask: ${parts.task.trim()}`);
  if (parts.context.trim()) lines.push(`\nContext:\n${parts.context.trim()}`);
  if (parts.constraints.trim()) lines.push(`\nConstraints:\n${parts.constraints.trim()}`);
  if (parts.format.trim()) lines.push(`\nFormat the answer as ${parts.format.trim()}.`);
  if (parts.tone.trim()) lines.push(`Write in a ${parts.tone.trim()} tone.`);
  if (parts.examples.trim()) lines.push(`\nExamples:\n${parts.examples.trim()}`);
  return lines.join("\n").trim();
}


export function PromptStudioPage() {
  const [parts, setParts] = useState<PromptParts>(EMPTY);
  const [refined, setRefined] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const composed = useMemo(() => compose(parts), [parts]);
  const output = refined ?? composed;

  const refine = useMutation({
    mutationFn: () => tauriInvoke<string>("refine_prompt", { draft: composed }),
    onSuccess: (result) => setRefined(result),
  });

  const set = (key: keyof PromptParts, value: string) => {
    setParts((p) => ({ ...p, [key]: value }));
    setRefined(null);
  };

  const copy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false),
    );
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-text-1 mb-1">Prompt Studio</h1>
      <p className="text-sm text-text-3 mb-8">
        Fill in the parts you know. The prompt builds itself as you type.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Building blocks */}
        <div className="space-y-4">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`prompt-${field.key}`}
                className="block text-xs font-mono tracking-widest uppercase text-text-4 mb-1"
              >
                {field.label}
                {field.key === "task" && <span className="text-accent ml-1">required</span>}
              </label>
              {field.multiline ? (
                <textarea
                  id={`prompt-${field.key}`}
                  value={parts[field.key]}
                  onChange={(e) => set(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={2}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                             placeholder:text-text-4 outline-none focus:border-accent-dim resize-y"
                />
              ) : (
                <input
                  id={`prompt-${field.key}`}
                  type="text"
                  value={parts[field.key]}
                  onChange={(e) => set(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                             placeholder:text-text-4 outline-none focus:border-accent-dim"
                />
              )}
            </div>
          ))}
        </div>

        {/* Live prompt */}
        <div className="lg:sticky lg:top-4 self-start w-full">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono tracking-widest uppercase text-text-4">
              Your prompt {refined && <span className="text-accent">refined</span>}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => refine.mutate()}
                disabled={!parts.task.trim() || refine.isPending}
                className="text-xs font-mono text-text-3 hover:text-text-1 disabled:opacity-40 transition-colors"
              >
                {refine.isPending ? "Refining..." : "Refine with AI"}
              </button>
              <button
                type="button"
                onClick={copy}
                disabled={!output}
                className="text-xs font-mono text-text-3 hover:text-text-1 disabled:opacity-40 transition-colors"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <pre
            aria-label="Composed prompt"
            className="min-h-[300px] p-4 text-sm font-body text-text-2 bg-surface border border-border
                       whitespace-pre-wrap leading-relaxed overflow-auto"
          >
            {output || "Start with the task. Your prompt appears here."}
          </pre>

          {refine.isError && (
            <p role="alert" className="mt-2 text-xs text-error">{formatError(refine.error)}</p>
          )}
          {refined && (
            <button
              type="button"
              onClick={() => setRefined(null)}
              className="mt-2 text-xs font-mono text-text-4 hover:text-text-2 transition-colors"
            >
              Back to my version
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
