/*
 * Name: studio-api.ts
 * Purpose: Frontend bridge to the Studio generation command, plus the shapes it
 *   returns and a tolerant parser for them.
 * Description: The backend returns the model's raw text. Flashcards, quizzes,
 *   and mind maps come back as JSON, so extractJson pulls the JSON value out
 *   even when a model wraps it in prose or a code fence, and throws a clear
 *   error when nothing usable is there. The study guide is Markdown and needs
 *   no parsing.
 * Tech Stack: TypeScript, Tauri v2
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-13
 */

import { tauriInvoke } from "@/services/tauri-client";

export type StudioFormat = "study_guide" | "flashcards" | "quiz" | "mind_map";

export function generateStudio(
  notebookId: string,
  format: StudioFormat,
  focus: string,
): Promise<string> {
  return tauriInvoke<string>("generate_studio", {
    notebook_id: notebookId,
    format,
    focus,
  });
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface MindMapChild {
  label: string;
}

export interface MindMapBranch {
  label: string;
  children?: MindMapChild[];
}

export interface MindMap {
  title: string;
  branches: MindMapBranch[];
}

/**
 * Pull a JSON array or object out of an LLM response. Handles a bare value, a
 * value wrapped in a ```json fence, or a value surrounded by stray prose.
 * Throws a readable error when the text holds no usable JSON.
 */
export function extractJson<T>(text: string): T {
  let source = text.trim();

  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) source = fenced[1].trim();

  const start = source.search(/[[{]/);
  if (start === -1) throw new Error("The model did not return any structured data. Try again.");

  const closer = source[start] === "[" ? "]" : "}";
  const end = source.lastIndexOf(closer);
  if (end <= start) throw new Error("The model's response was cut off. Try again.");

  return JSON.parse(source.slice(start, end + 1)) as T;
}

/**
 * extractJson without throwing: returns the parsed value or a readable message.
 * Keeps JSON parsing out of component render bodies.
 */
export function safeJson<T>(text: string): { data: T } | { error: string } {
  try {
    return { data: extractJson<T>(text) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The result could not be read." };
  }
}
