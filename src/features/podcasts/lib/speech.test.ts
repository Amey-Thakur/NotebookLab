/*
 * Name: speech.test.ts
 * Purpose: Pin the parts of read-aloud that can be checked without listening.
 * Description: Voice ranking and sentence splitting decide whether this sounds
 *   like two people talking or like a screen reader, and both fail quietly: a
 *   bad rank picks a robotic voice, and a bad split truncates a long answer
 *   mid-word with no error anywhere.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-28
 */

import { describe, expect, it } from "vitest";

import { pickVoices, prosodyFor, toSegments, voiceQuality, voicesAreBasic } from "./speech";

function voice(name: string, extra: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice {
  return {
    name,
    lang: "en-US",
    default: false,
    localService: true,
    voiceURI: name,
    ...extra,
  } as SpeechSynthesisVoice;
}

describe("voiceQuality", () => {
  it("ranks a neural voice above an old desktop one", () => {
    /* This is the whole point: both are installed on a stock Windows machine
       and the previous name-matching picked whichever came first. */
    const natural = voice("Microsoft Aria Online (Natural) - English (United States)", {
      localService: false,
    });
    const desktop = voice("Microsoft Zira Desktop - English (United States)");
    expect(voiceQuality(natural)).toBeGreaterThan(voiceQuality(desktop));
  });

  it("ranks macOS premium above compact", () => {
    expect(voiceQuality(voice("Samantha (Premium)"))).toBeGreaterThan(
      voiceQuality(voice("Samantha (Compact)")),
    );
  });

  it("penalises espeak, which is the robotic fallback on Linux", () => {
    expect(voiceQuality(voice("espeak-ng"))).toBeLessThan(voiceQuality(voice("Daniel")));
  });
});

describe("pickVoices", () => {
  it("picks the two best and does not repeat one when others exist", () => {
    const list = [
      voice("Microsoft David Desktop"),
      voice("Microsoft Aria Online (Natural)", { localService: false }),
      voice("Microsoft Guy Online (Natural)", { localService: false }),
    ];
    const { a, b } = pickVoices(list);
    expect(a!.name).toContain("Natural");
    expect(b!.name).toContain("Natural");
    expect(a!.name).not.toBe(b!.name);
  });

  it("prefers a contrasting second voice among equals", () => {
    const list = [
      voice("Aria (Natural)", { localService: false }),
      voice("Jenny (Natural)", { localService: false }),
      voice("Guy (Natural)", { localService: false }),
    ];
    const { b } = pickVoices(list);
    expect(b!.name).toBe("Guy (Natural)");
  });

  it("falls back to the one voice available rather than returning nothing", () => {
    const { a, b } = pickVoices([voice("Only Voice")]);
    expect(a!.name).toBe("Only Voice");
    expect(b!.name).toBe("Only Voice");
  });

  it("survives a system with no voices at all", () => {
    expect(pickVoices([])).toEqual({ a: null, b: null });
  });

  it("ignores non-English voices when English ones exist", () => {
    const list = [voice("Deutsche Stimme", { lang: "de-DE" }), voice("Aria")];
    expect(pickVoices(list).a!.name).toBe("Aria");
  });
});

describe("toSegments", () => {
  it("splits a turn into sentences and marks where a turn starts", () => {
    const segments = toSegments([{ speaker: "A", text: "First one. Second one." }]);
    expect(segments.map((s) => s.text)).toEqual(["First one.", "Second one."]);
    expect(segments[0].startsTurn).toBe(true);
    expect(segments[1].startsTurn).toBe(false);
  });

  it("keeps every segment pointing at the turn it came from", () => {
    const segments = toSegments([
      { speaker: "A", text: "One. Two." },
      { speaker: "B", text: "Three." },
    ]);
    expect(segments.map((s) => s.turn)).toEqual([0, 0, 1]);
    expect(segments.map((s) => s.speaker)).toEqual(["A", "A", "B"]);
  });

  it("does not split on a decimal point", () => {
    /* Splitting on every full stop would read "version 3." then "5 is out". */
    const segments = toSegments([{ speaker: "A", text: "It runs at 3.5 tokens per second." }]);
    expect(segments).toHaveLength(1);
  });

  it("breaks a very long sentence so the engine cannot truncate it", () => {
    /* Several engines silently stop past a few hundred characters, which cut
       long answers off mid-word with no error. */
    const long = "word ".repeat(200).trim() + ".";
    const segments = toSegments([{ speaker: "A", text: long }]);
    expect(segments.length).toBeGreaterThan(1);
    for (const s of segments) {
      expect(s.text.length).toBeLessThanOrEqual(240);
    }
    /* Nothing may be lost in the split. */
    const rejoined = segments.map((s) => s.text).join(" ");
    expect(rejoined.replace(/\s+/g, " ")).toBe(long.replace(/\s+/g, " "));
  });

  it("produces nothing for empty turns rather than an empty utterance", () => {
    expect(toSegments([{ speaker: "A", text: "   " }])).toEqual([]);
    expect(toSegments([])).toEqual([]);
  });
});

describe("prosodyFor", () => {
  it("is deterministic, so a script sounds the same every time", () => {
    /* Random variation would mean the same audio read differently on each
       playback, which is unsettling rather than natural. */
    expect(prosodyFor("A sentence.", 0)).toEqual(prosodyFor("A sentence.", 0));
  });

  it("varies between sentences", () => {
    const a = prosodyFor("First sentence here.", 0);
    const b = prosodyFor("A different sentence entirely.", 1);
    expect(a.rate === b.rate && a.pitch === b.pitch).toBe(false);
  });

  it("lifts every question above every statement", () => {
    /* The lift has to beat the sentence-to-sentence variation, or a question can
       land lower than the statement before it and the rise that makes it sound
       like a question is simply absent. */
    const questions = Array.from({ length: 50 }, (_, i) =>
      prosodyFor(`Is number ${i} really right?`, i).pitch,
    );
    const statements = Array.from({ length: 50 }, (_, i) =>
      prosodyFor(`Number ${i} is right.`, i).pitch,
    );
    expect(Math.min(...questions)).toBeGreaterThan(Math.max(...statements));
  });

  it("stays within a range that still sounds like a person", () => {
    /* Past a couple of percent it reads as a fault rather than as speech. */
    for (let i = 0; i < 200; i += 1) {
      const { rate, pitch } = prosodyFor(`sentence number ${i} of the script.`, i);
      expect(rate).toBeGreaterThan(0.85);
      expect(rate).toBeLessThan(1.1);
      expect(pitch).toBeGreaterThan(0.9);
      expect(pitch).toBeLessThan(1.1);
    }
  });
});

describe("voicesAreBasic", () => {
  it("flags a machine with only old desktop voices", () => {
    expect(
      voicesAreBasic([
        { name: "Microsoft Zira Desktop", lang: "en-US", localService: true } as SpeechSynthesisVoice,
      ]),
    ).toBe(true);
  });

  it("does not flag a machine with neural voices", () => {
    expect(
      voicesAreBasic([
        { name: "Microsoft Aria (Natural)", lang: "en-US", localService: false } as SpeechSynthesisVoice,
      ]),
    ).toBe(false);
  });

  it("says nothing when voices have not loaded yet", () => {
    /* getVoices() is empty until the engine is ready; warning then would show
       the hint to everyone on first paint. */
    expect(voicesAreBasic([])).toBe(false);
  });
});
