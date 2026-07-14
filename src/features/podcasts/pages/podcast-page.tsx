/*
 * Name: podcast-page.tsx
 * Purpose: Podcast generation and playback page.
 * Description: The LLM generates a conversation script, and the browser's
 *   SpeechSynthesis API reads it aloud with distinct voices. Uses
 *   Web Speech API for TTS (offline, zero-config, cross-platform).
 *   Two different voices are assigned to Speaker A and Speaker B.
 *   The script is stored in component state (not persisted to
 *   disk). Audio quality depends on OS voices. Can be upgraded to
 *   Piper/Kokoro TTS later for better quality.
 * Tech Stack: React 19, TanStack Query, Web Speech API, Tailwind CSS
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";

import { tauriInvoke } from "@/services/tauri-client";
import { ROUTES } from "@/lib/constants";
import { formatError } from "@/lib/format-error";
import { useNotebookStore } from "@/stores/notebook-store";


interface PodcastTurn {
  speaker: string;
  text: string;
}

interface PodcastScript {
  title: string;
  turns: PodcastTurn[];
}

type AudioFormat = "discussion" | "brief" | "debate" | "critique";

const FORMATS: { id: AudioFormat; label: string; blurb: string }[] = [
  { id: "discussion", label: "Discussion", blurb: "Two hosts explore the material together." },
  { id: "brief", label: "Brief", blurb: "A single narrator, the gist in under a minute." },
  { id: "debate", label: "Debate", blurb: "Two speakers argue opposing sides." },
  { id: "critique", label: "Critique", blurb: "A careful look at strengths and gaps." },
];


export function PodcastPage() {
  const activeNotebookId = useNotebookStore((s) => s.activeNotebookId);
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<AudioFormat>("discussion");
  const [script, setScript] = useState<PodcastScript | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(-1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const synthRef = useRef(window.speechSynthesis);
  /* Set before cancel() so the interrupt event cannot re-enter the play loop and
     resume from the next turn. */
  const cancelledRef = useRef(false);

  /* Load available voices */
  useEffect(() => {
    const loadVoices = () => {
      const available = synthRef.current.getVoices();
      if (available.length > 0) setVoices(available);
    };
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  /* Stop playback when leaving the page; otherwise the chained utterances
     keep reading with no visible way to stop them. */
  useEffect(() => {
    const synth = synthRef.current;
    return () => {
      cancelledRef.current = true;
      synth.cancel();
    };
  }, []);

  const generate = useMutation({
    mutationFn: () => tauriInvoke<PodcastScript>("generate_podcast", {
      notebook_id: activeNotebookId,
      topic: topic || null,
      format,
    }),
    onSuccess: (result) => {
      /* Stop any in-flight playback before swapping the script; otherwise the
         old utterance chain keeps reading while highlights track the new turns
         and the new script cannot be played until the user hits Stop. */
      cancelledRef.current = true;
      synthRef.current.cancel();
      setIsPlaying(false);
      setScript(result);
      setCurrentTurn(-1);
    },
  });

  /* Pick two distinct voices for the speakers */
  const getVoiceForSpeaker = useCallback((speaker: string): SpeechSynthesisVoice | null => {
    const englishVoices = voices.filter((v) => v.lang.startsWith("en"));
    if (englishVoices.length === 0) return voices[0] ?? null;

    if (speaker === "A") {
      /* Try to find a female voice for Speaker A */
      return englishVoices.find((v) => /female|zira|samantha|karen|fiona/i.test(v.name))
        ?? englishVoices[0];
    } else {
      /* Try to find a male voice for Speaker B */
      return englishVoices.find((v) => /male|david|daniel|james|mark/i.test(v.name))
        ?? englishVoices[Math.min(1, englishVoices.length - 1)];
    }
  }, [voices]);

  const playScript = useCallback(() => {
    if (!script || isPlaying) return;

    cancelledRef.current = false;
    setIsPlaying(true);
    setCurrentTurn(0);

    const speakTurn = (index: number) => {
      /* A cancel() during playback fires the current utterance's end/error, which
      would otherwise re-enter here; bail so Stop and navigation truly stop. */
      if (cancelledRef.current) return;
      if (index >= script.turns.length) {
        setIsPlaying(false);
        setCurrentTurn(-1);
        return;
      }

      const turn = script.turns[index];
      const utterance = new SpeechSynthesisUtterance(turn.text);
      const voice = getVoiceForSpeaker(turn.speaker);
      if (voice) utterance.voice = voice;

      utterance.rate = 1.0;
      utterance.pitch = turn.speaker === "A" ? 1.1 : 0.9;

      utterance.onstart = () => setCurrentTurn(index);
      utterance.onend = () => speakTurn(index + 1);
      utterance.onerror = () => speakTurn(index + 1);

      synthRef.current.speak(utterance);
    };

    speakTurn(0);
  }, [script, isPlaying, getVoiceForSpeaker]);

  const stopPlayback = () => {
    cancelledRef.current = true;
    synthRef.current.cancel();
    setIsPlaying(false);
    setCurrentTurn(-1);
  };

  if (!activeNotebookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-3 p-8">
        <p className="text-lg font-display font-bold mb-2">Audio overview</p>
        <p className="text-sm text-text-4 mb-4">Select a notebook first to generate an audio overview.</p>
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
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-text-1 mb-2">Audio overview</h1>
      <p className="text-sm text-text-3 mb-6">
        Turn this notebook into a spoken overview, read aloud in your browser.
      </p>

      {/* Generation form */}
      <div className="border border-border bg-surface-2 p-4 mb-6">
        <h2 className="text-xs font-mono tracking-widest uppercase text-text-4 mb-3">
          Generate audio
        </h2>

        {/* Format picker */}
        <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Audio format">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={format === f.id}
              onClick={() => setFormat(f.id)}
              className={`px-3 py-1.5 text-sm font-mono border transition-colors ${
                format === f.id
                  ? "border-accent-dim text-text-1 bg-surface"
                  : "border-border text-text-3 hover:text-text-1"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-4 mb-3">{FORMATS.find((f) => f.id === format)?.blurb}</p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (optional)"
            aria-label="Podcast topic (optional)"
            className="flex-1 px-3 py-2 text-sm bg-surface border border-border text-text-1
                       placeholder:text-text-4 outline-none focus:border-accent-dim"
          />
          <button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="px-4 py-2 text-sm font-mono bg-primary text-on-primary
                       hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {generate.isPending ? "Writing script..." : "Generate"}
          </button>
        </div>
        {generate.isError && (
          <p role="alert" className="text-xs text-error">{formatError(generate.error)}</p>
        )}
      </div>

      {/* Script display + playback */}
      {script && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono tracking-widest uppercase text-text-4">
              {script.title} ({script.turns.length} turns)
            </h2>
            <div className="flex gap-2">
              {!isPlaying ? (
                <button
                  type="button"
                  onClick={playScript}
                  className="px-3 py-1 text-xs font-mono bg-primary text-on-primary"
                >
                  Play
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopPlayback}
                  className="px-3 py-1 text-xs font-mono border border-error text-error"
                >
                  Stop
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {script.turns.map((turn, i) => (
              <div
                key={i}
                className={`p-3 border transition-colors ${
                  currentTurn === i
                    ? "border-accent-dim bg-surface-2"
                    : "border-border"
                }`}
              >
                <span className={`text-xs font-mono font-bold mr-2 ${
                  turn.speaker === "A" ? "text-accent" : "text-mark"
                }`}>
                  Speaker {turn.speaker}
                </span>
                <span className="text-sm text-text-2">{turn.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
