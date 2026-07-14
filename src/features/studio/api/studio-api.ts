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

export type StudioFormat =
  | "study_guide"
  | "flashcards"
  | "quiz"
  | "mind_map"
  | "timeline"
  | "slide_deck"
  | "data_table"
  | "briefing"
  | "blog_post";

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

export interface TimelineEvent {
  date: string;
  title: string;
  description: string;
}

export interface Timeline {
  title: string;
  events: TimelineEvent[];
}

export interface Slide {
  title: string;
  bullets: string[];
}

export interface SlideDeck {
  title: string;
  slides: Slide[];
}

export interface DataTable {
  title: string;
  columns: string[];
  rows: string[][];
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

/**
 * Coerce a value that should be an array into one, guarding the views against a
 * model that returns the wrong shape. A non-array becomes an empty array, which
 * flows into each view's "came back empty" message instead of crashing render.
 */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Coerce a model field that should be text into a safe string. If the model
 * returns an object or array where a string was expected, this yields "" rather
 * than letting React throw "Objects are not valid as a React child" and take
 * down the whole app.
 */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

/**
 * For a format whose top level should be an array: return it if it already is,
 * otherwise recover a single array-valued property (models often wrap the array
 * in an object like {"questions": [...]}). Returns null when nothing usable.
 */
export function asItemArray<T>(value: unknown): T[] | null {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const nested = Object.values(value).find((v) => Array.isArray(v));
    if (nested) return nested as T[];
  }
  return null;
}
