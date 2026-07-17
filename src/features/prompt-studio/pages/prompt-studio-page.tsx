/*
 * Name: prompt-studio-page.tsx
 * Purpose: Craft complete, ready-to-run prompts from a plain description or
 *   from building blocks.
 * Description: Two ways in. Describe: say what you want done in plain words
 *   and the crafter writes the whole prompt, choosing the right technique for
 *   the task (few-shot examples for classification, step-by-step reasoning for
 *   logic, role and style for creative work) and returning recommended model
 *   settings, the variables to fill, and short notes on why it is built that
 *   way. Compose: fill in the classic building blocks and the prompt assembles
 *   live, with the same crafter available to upgrade the draft. Unknown
 *   specifics become {variables} instead of invented facts, so results are
 *   accurate and reusable. The crafter's reply is parsed tolerantly and can
 *   never crash the page.
 * Tech Stack: React 19, TanStack Query, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { QUERY_KEYS } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import { usePersistentDraft } from "@/lib/use-persistent-draft";
import { ModelRequiredNotice } from "@/components/shared/model-required-notice";
import {
  craftPrompt,
  parseCrafted,
  type CraftMode,
  type CraftedPrompt,
} from "../api/prompt-api";

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

type StudioMode = "describe" | "compose";

const PARTS_DRAFT_KEY = "notebooklab-draft-prompt-parts";

export function PromptStudioPage() {
  const [mode, setMode] = useState<StudioMode>("describe");
  /* The typed input is preserved across navigation and reload, so a described
     job or half-built prompt is never lost by leaving the page. */
  const [describe, setDescribe] = usePersistentDraft("notebooklab-draft-prompt-describe");
  const [parts, setParts] = useState<PromptParts>(() => {
    try {
      const raw = localStorage.getItem(PARTS_DRAFT_KEY);
      if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<PromptParts>) };
    } catch {
      /* Unreadable draft: fall back to empty. */
    }
    return EMPTY;
  });
  const [result, setResult] = useState<{ text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      if (Object.values(parts).some((v) => v.trim())) {
        localStorage.setItem(PARTS_DRAFT_KEY, JSON.stringify(parts));
      } else {
        localStorage.removeItem(PARTS_DRAFT_KEY);
      }
    } catch {
      /* Storage unavailable: the draft simply is not persisted. */
    }
  }, [parts]);

  const composed = useMemo(() => compose(parts), [parts]);
  const crafted = useMemo(() => (result ? parseCrafted(result.text) : null), [result]);

  const craft = useMutation({
    mutationFn: ({ input, craftMode }: { input: string; craftMode: CraftMode }) =>
      craftPrompt(input, craftMode),
    onSuccess: (text) => {
      if (text.trim()) setResult({ text });
    },
  });

  const set = (key: keyof PromptParts, value: string) => {
    setParts((p) => ({ ...p, [key]: value }));
  };

  const output = crafted?.prompt || (mode === "compose" ? composed : "");

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

  const pickMode = (next: StudioMode) => {
    setMode(next);
    setResult(null);
    craft.reset();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-text-1 mb-1">Prompt Studio</h1>
      <p className="text-sm text-text-3 mb-6">
        Describe the job and get a complete, ready-to-run prompt, or build one from parts.
      </p>

      <ModelRequiredNotice action="Prompt Studio" />

      {/* Mode picker */}
      <div className="flex gap-2 mb-6" role="group" aria-label="Prompt Studio mode">
        {(
          [
            ["describe", "Describe it"],
            ["compose", "Build it"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => pickMode(id)}
            className={`px-4 py-2 text-sm font-mono border transition-colors ${
              mode === id
                ? "border-accent-dim text-text-1 bg-surface-2"
                : "border-border text-text-3 hover:text-text-1"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input side */}
        {mode === "describe" ? (
          <div>
            <label
              htmlFor="prompt-describe"
              className="block text-xs font-mono tracking-widest uppercase text-text-4 mb-1"
            >
              What do you want the AI to do?
            </label>
            <textarea
              id="prompt-describe"
              value={describe}
              onChange={(e) => setDescribe(e.target.value)}
              placeholder={
                "Say it like you would to a colleague. For example: sort incoming support emails into billing, bug, or feature request, with a one-line reason. Or: write a warm launch announcement for our new app aimed at students."
              }
              rows={7}
              className="w-full px-3 py-2 text-sm bg-surface border border-border text-text-1
                         placeholder:text-text-4 outline-none focus:border-accent-dim resize-y"
            />
            <button
              type="button"
              onClick={() => craft.mutate({ input: describe.trim(), craftMode: "generate" })}
              disabled={!describe.trim() || craft.isPending}
              className="mt-3 px-5 py-2 text-sm font-mono bg-primary text-on-primary
                         hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              {craft.isPending ? "Crafting..." : "Craft the prompt"}
            </button>
            <p className="mt-3 text-xs text-text-4 leading-relaxed">
              The crafter picks the right technique for the task: worked examples for sorting and
              extraction, step-by-step reasoning for logic, role and style for creative work. Details
              it does not know become {"{variables}"} you fill in, never invented facts.
            </p>
            <AgentSkillsPanel
              onInsert={(text) =>
                setDescribe(describe.trim() ? `${describe.trim()}\n\n${text}` : text)
              }
            />
          </div>
        ) : (
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
        )}

        {/* Output side */}
        <div className="lg:sticky lg:top-4 self-start w-full">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono tracking-widest uppercase text-text-4">
              {crafted ? "Crafted prompt" : "Your prompt"}
            </span>
            <div className="flex items-center gap-3">
              {mode === "compose" && (
                <button
                  type="button"
                  onClick={() => craft.mutate({ input: composed, craftMode: "refine" })}
                  disabled={!parts.task.trim() || craft.isPending}
                  className="text-xs font-mono text-text-3 hover:text-text-1 disabled:opacity-40 transition-colors"
                >
                  {craft.isPending ? "Upgrading..." : "Upgrade with AI"}
                </button>
              )}
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
            aria-label="Prompt output"
            className="min-h-[260px] p-4 text-sm font-body text-text-2 bg-surface border border-border
                       whitespace-pre-wrap leading-relaxed overflow-auto"
          >
            {output ||
              (mode === "describe"
                ? "Describe the job on the left and the finished prompt appears here."
                : "Start with the task. Your prompt appears here.")}
          </pre>

          {craft.isError && (
            <p role="alert" className="mt-2 text-xs text-error">
              {formatError(craft.error)}
            </p>
          )}

          {crafted && <CraftedDetails crafted={crafted} />}

          {crafted && (
            <button
              type="button"
              onClick={() => setResult(null)}
              className="mt-3 text-xs font-mono text-text-4 hover:text-text-2 transition-colors"
            >
              {mode === "compose" ? "Back to my version" : "Clear"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* The extras that make a crafted prompt usable in real work: the settings to
   run it with, the variables to fill first, and why it is built the way it is. */
function CraftedDetails({ crafted }: { crafted: CraftedPrompt }) {
  const { settings, variables, notes } = crafted;
  const chips: string[] = [];
  if (settings.temperature !== undefined) chips.push(`Temperature ${settings.temperature}`);
  if (settings.top_p !== undefined) chips.push(`Top-P ${settings.top_p}`);
  if (settings.top_k !== undefined) chips.push(`Top-K ${settings.top_k}`);
  if (settings.max_tokens !== undefined) chips.push(`Max tokens ${settings.max_tokens}`);

  if (chips.length === 0 && variables.length === 0 && notes.length === 0) return null;

  return (
    <div className="mt-4 space-y-4">
      {chips.length > 0 && (
        <div>
          <p className="text-2xs font-mono tracking-widest uppercase text-text-4 mb-1.5">
            Run it with
          </p>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span
                key={chip}
                className="px-2 py-1 text-xs font-mono border border-border bg-surface-2 text-text-2"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}

      {variables.length > 0 && (
        <div>
          <p className="text-2xs font-mono tracking-widest uppercase text-text-4 mb-1.5">
            Fill these before use
          </p>
          <ul className="space-y-1">
            {variables.map((variable) => (
              <li key={variable.name} className="text-xs text-text-2">
                <code className="font-mono text-accent">{variable.name}</code>
                {variable.purpose && <span className="text-text-3"> {variable.purpose}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div>
          <p className="text-2xs font-mono tracking-widest uppercase text-text-4 mb-1.5">
            Why it is built this way
          </p>
          <ul className="list-disc pl-4 space-y-1">
            {notes.map((note, i) => (
              <li key={i} className="text-xs text-text-3 leading-relaxed">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface AgentSkill {
  kind: string;
  name: string;
  description: string;
  raw_url: string;
}

/* Proven working methods from the AI-SKILLS library
   (github.com/Amey-Thakur/AI-SKILLS), loaded automatically and cached for a
   day. Inserting one appends its method to the describe field in plain sight,
   so the crafter can build on it; nothing is ever injected invisibly. */
function AgentSkillsPanel({ onInsert }: { onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [inserting, setInserting] = useState<string | null>(null);
  const [insertError, setInsertError] = useState<string | null>(null);

  const { data: skills } = useQuery({
    queryKey: [QUERY_KEYS.AGENT_SKILLS],
    queryFn: () => tauriInvoke<AgentSkill[]>("fetch_agent_skills"),
    staleTime: 60 * 60 * 1000,
  });

  const methods = (skills ?? []).filter((s) => s.kind === "skill");
  if (methods.length === 0) return null;

  const insert = (skill: AgentSkill) => {
    setInserting(skill.name);
    setInsertError(null);
    tauriInvoke<string>("fetch_agent_skill_body", { raw_url: skill.raw_url })
      .then((body) => {
        /* Drop the frontmatter; the method itself is what helps the crafter. */
        const method = body.replace(/^---[\s\S]*?---\s*/, "").trim();
        onInsert(`Apply this working method:\n${method}`);
      })
      .catch((e) => setInsertError(formatError(e)))
      .finally(() => setInserting(null));
  };

  return (
    <div className="mt-5 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="text-xs font-mono text-text-4 hover:text-text-2 transition-colors"
      >
        {open ? "Hide proven methods" : `Start from a proven method (${methods.length})`}
      </button>
      {open && (
        <>
          <p className="mt-2 text-2xs text-text-4 leading-relaxed">
            Working methods from the open AI-SKILLS library. Inserting one adds it to your
            description above, visibly, so the crafted prompt builds on it.
          </p>
          <div className="mt-2 space-y-1 max-h-[240px] overflow-y-auto pr-1">
            {methods.map((skill) => (
              <div
                key={skill.name}
                className="flex items-start justify-between gap-3 border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="block text-xs font-mono text-text-1">{skill.name}</span>
                  <span className="block text-2xs text-text-4 leading-relaxed">
                    {skill.description}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => insert(skill)}
                  disabled={inserting !== null}
                  className="shrink-0 px-2.5 py-1 text-2xs font-mono border border-border text-text-3
                             hover:border-accent-dim hover:text-text-1 transition-colors disabled:opacity-50"
                >
                  {inserting === skill.name ? "Loading..." : "Insert"}
                </button>
              </div>
            ))}
          </div>
          {insertError && (
            <p role="alert" className="mt-2 text-2xs text-error">
              {insertError}
            </p>
          )}
        </>
      )}
    </div>
  );
}
