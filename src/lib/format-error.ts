/*
 * Title: format-error.ts
 * Tech Stack: TypeScript
 * Description: Converts backend and IPC errors into plain-language messages.
 * Important Details: Raw errors look like "[send_chat_message] Provider error:
 *   HTTP 500 ..." which reads as noise to users. Known failure shapes map to
 *   short guidance with a recovery hint; anything unknown falls back to the
 *   cleaned original text so real detail is never hidden.
 */

interface ErrorHint {
  match: RegExp;
  message: string;
}

const HINTS: ErrorHint[] = [
  {
    match: /no active provider|select a model first/i,
    message: "No AI model is connected. Open Models and pick a provider to continue.",
  },
  {
    match: /connection refused|error sending request|request failed|network/i,
    message: "Could not reach the AI provider. Check that it is running, then try again.",
  },
  {
    match: /timed out|timeout/i,
    message: "The AI provider took too long to answer. Try again, or switch to a smaller model.",
  },
  {
    match: /already been imported/i,
    message: "This file is already in the notebook.",
  },
  {
    match: /a download is already in progress/i,
    message: "A model download is already running. Let it finish first.",
  },
];

/**
 * Turn any thrown value into a short, human-readable message.
 * The technical detail stays available in the console for debugging.
 */
export function formatError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  /* Strip the "[command_name] " prefix added by tauriInvoke */
  const cleaned = raw.replace(/^\[[a-z_]+\]\s*/i, "").trim();

  for (const hint of HINTS) {
    if (hint.match.test(cleaned)) {
      return hint.message;
    }
  }

  return cleaned || "Something went wrong. Please try again.";
}
