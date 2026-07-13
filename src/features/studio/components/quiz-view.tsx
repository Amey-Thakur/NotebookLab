/*
 * Name: quiz-view.tsx
 * Purpose: Take the generated quiz and see how you did.
 * Description: Each question shows its options as buttons; choosing one locks
 *   the answer, marks it right or wrong, and reveals the grounded explanation,
 *   while a running tally builds at the top. Right and wrong use the theme's
 *   accent and error colors rather than raw greens and reds, and each option is
 *   a real button so the whole quiz works by keyboard.
 * Tech Stack: React 19, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { QuizQuestion } from "../api/studio-api";

export function QuizView({ questions }: { questions: QuizQuestion[] }) {
  const [chosen, setChosen] = useState<Record<number, number>>({});

  if (questions.length === 0) {
    return <p className="text-sm text-text-3">No questions came back. Try a broader focus.</p>;
  }

  const answeredCount = Object.keys(chosen).length;
  const score = questions.reduce((sum, q, i) => (chosen[i] === q.answer ? sum + 1 : sum), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {answeredCount > 0 && (
        <p className="text-sm font-mono text-text-3" role="status">
          Score so far: {score} of {answeredCount} answered
        </p>
      )}

      {questions.map((q, i) => {
        const pick = chosen[i];
        const isAnswered = pick !== undefined;
        return (
          <div key={i}>
            <p className="text-sm font-medium text-text-1 mb-3">
              {i + 1}. {q.question}
            </p>
            <div className="space-y-2" role="group" aria-label={`Question ${i + 1} options`}>
              {q.options.map((option, o) => {
                const isCorrect = o === q.answer;
                const isPicked = o === pick;
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={isAnswered}
                    onClick={() => setChosen((c) => ({ ...c, [i]: o }))}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-sm border transition-colors outline-none",
                      "focus-visible:border-accent disabled:cursor-default",
                      !isAnswered && "border-border bg-surface text-text-2 hover:border-accent-dim",
                      isAnswered && isCorrect && "border-accent bg-surface-2 text-text-1",
                      isAnswered && isPicked && !isCorrect && "border-error text-text-1",
                      isAnswered && !isCorrect && !isPicked && "border-border text-text-4",
                    )}
                  >
                    {option}
                    {isAnswered && isCorrect && <span className="float-right text-accent">Correct</span>}
                    {isAnswered && isPicked && !isCorrect && <span className="float-right text-error">Your pick</span>}
                  </button>
                );
              })}
            </div>
            {isAnswered && (
              <p className="mt-3 text-xs text-text-3 leading-relaxed">
                {pick === q.answer ? "Right. " : "Not quite. "}
                {q.explanation}
              </p>
            )}
          </div>
        );
      })}

      {answeredCount === questions.length && (
        <p className="text-sm font-display font-bold text-text-1">
          Final score: {score} of {questions.length}.
        </p>
      )}
    </div>
  );
}
