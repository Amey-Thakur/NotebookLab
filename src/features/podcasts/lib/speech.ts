/*
 * Name: speech.ts
 * Purpose: Make the read-aloud sound like speech rather than a screen reader.
 * Description: The first version handed each whole turn to the engine at rate
 *   1.0 with pitch 1.1 and 0.9, and started the next turn the instant the last
 *   one ended. Three things were wrong with that.
 *
 *   Voices were chosen by matching names against a list of guesses. Windows and
 *   macOS both ship high quality neural voices alongside the old robotic ones,
 *   and the name list picked whichever happened to match first, so the good ones
 *   were usually ignored.
 *
 *   Pitch shifting by 0.2 to tell two speakers apart is the cartoon approach.
 *   Two genuinely different voices carry the distinction on their own, and the
 *   remaining nudge can be small enough not to sound processed.
 *
 *   Turns ran together with no gap. Real conversation has a beat where a speaker
 *   changes, and without it the exchange sounds like one person reading a
 *   transcript aloud.
 *
 *   Splitting long turns into sentences also works around a real defect: several
 *   engines silently truncate an utterance past a few hundred characters, so a
 *   long answer would simply stop partway through.
 * Tech Stack: TypeScript, Web Speech API
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

/** Slightly under conversational pace: easier to follow over several minutes. */
export const SPEECH_RATE = 0.96;

/** A beat when the speaker changes, and a shorter one between sentences. */
export const GAP_BETWEEN_SPEAKERS_MS = 420;
export const GAP_BETWEEN_SENTENCES_MS = 140;

/** Engines start dropping audio somewhere past this; sentences stay well under. */
const MAX_UTTERANCE_CHARS = 240;

/** One thing to say: a single sentence, and which turn it belongs to. */
export interface Segment {
  text: string;
  speaker: string;
  /** Index of the turn this came from, so the transcript can follow along. */
  turn: number;
  /** True when this is the first sentence of a new speaker's turn. */
  startsTurn: boolean;
}

/**
 * How good a voice is likely to sound.
 *
 * Neural voices are labelled differently on every platform, so this scores the
 * markers rather than listing names: "Natural" and "Neural" on Windows, the
 * premium and enhanced tiers on macOS, and network voices, which are the good
 * ones wherever they appear.
 */
export function voiceQuality(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  let score = 0;
  if (/natural|neural/.test(name)) score += 6;
  if (/premium|enhanced/.test(name)) score += 5;
  if (/online/.test(name)) score += 3;
  if (!voice.localService) score += 2;
  /* The old desktop voices are the ones people call robotic. */
  if (/desktop|espeak|compact/.test(name)) score -= 4;
  if (voice.default) score += 1;
  return score;
}

/**
 * Choose two voices that sound different from each other and good on their own.
 *
 * Quality comes first, because a well-matched pair of poor voices is still
 * unpleasant to listen to. Among equally good voices it prefers a pair that read
 * as different people, falling back to the same voice with a small pitch offset
 * when the system only has one worth using.
 */
export function pickVoices(
  voices: SpeechSynthesisVoice[],
): { a: SpeechSynthesisVoice | null; b: SpeechSynthesisVoice | null } {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = (english.length > 0 ? english : voices)
    .slice()
    .sort((x, y) => voiceQuality(y) - voiceQuality(x));

  if (pool.length === 0) return { a: null, b: null };

  const a = pool[0];
  /* A different voice for B. Preferring one whose name suggests the other
     common gender is a heuristic, not a guarantee, so it is only a tiebreak
     among voices that are already good. */
  const others = pool.slice(1);
  const contrasting =
    others.find((v) => suggestsOtherVoice(a.name, v.name)) ?? others[0] ?? a;

  return { a, b: contrasting };
}

/** True when two voice names read as different speakers. */
function suggestsOtherVoice(first: string, second: string): boolean {
  const feminine = /female|zira|aria|jenny|samantha|karen|fiona|sonia|libby|michelle/i;
  const masculine = /male|david|mark|guy|daniel|james|ryan|eric|christopher|roger/i;
  const firstIsFeminine = feminine.test(first);
  const secondIsFeminine = feminine.test(second);
  const firstIsMasculine = masculine.test(first);
  const secondIsMasculine = masculine.test(second);
  if (firstIsFeminine && secondIsMasculine) return true;
  if (firstIsMasculine && secondIsFeminine) return true;
  return false;
}

/**
 * Break turns into sentences the engine can speak cleanly.
 *
 * Splits after terminal punctuation followed by a space, which keeps decimals,
 * abbreviations and ellipses intact far better than splitting on every full
 * stop. Anything still too long is broken at a comma, then at a word, so no
 * segment can reach the length where engines start truncating.
 */
export function toSegments(turns: { speaker: string; text: string }[]): Segment[] {
  const segments: Segment[] = [];

  turns.forEach((turn, index) => {
    const sentences = turn.text
      .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
      .flatMap(splitLongSentence)
      .map((s) => s.trim())
      .filter(Boolean);

    sentences.forEach((text, position) => {
      segments.push({
        text,
        speaker: turn.speaker,
        turn: index,
        startsTurn: position === 0,
      });
    });
  });

  return segments;
}

/** Break a sentence that would still be truncated, at the least bad place. */
function splitLongSentence(sentence: string): string[] {
  if (sentence.length <= MAX_UTTERANCE_CHARS) return [sentence];

  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_UTTERANCE_CHARS) {
    const window = rest.slice(0, MAX_UTTERANCE_CHARS);
    /* A comma is a natural breath; a space is merely acceptable. */
    const at = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "));
    const cut = at > MAX_UTTERANCE_CHARS / 2 ? at + 1 : window.lastIndexOf(" ");
    if (cut <= 0) break;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}
