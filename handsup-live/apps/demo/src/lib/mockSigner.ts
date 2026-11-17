import { useCallback, useEffect, useRef, useState } from "react";
import type { CaptionLine, Lang } from "./recognizer";

/**
 * Mock mode: a scripted pharmacy dialogue that needs no camera, model or LLM, so the whole flow can be shown
 * anywhere. It looks to the UI like the real recognizer: caption lines that grow one gloss at a time and become
 * final. Turn 1 is the customer's request; after the staff reply, turn 2 is "No." and then it starts over.
 */
export interface MockTurn {
  glosses: Array<[de: string, en: string]>;
  sentence: Record<Lang, string>;
}

export const MOCK_TURNS: MockTurn[] = [
  {
    glosses: [["HALLO", "hello"], ["MEDIKAMENT", "medicine"], ["KOPF", "head"], ["SCHMERZ", "pain"]],
    sentence: { en: "Hello. I need medicine for a headache.", de: "Hallo. Ich brauche Medizin gegen Kopfschmerzen." },
  },
  { glosses: [["NEIN", "no"]], sentence: { en: "No.", de: "Nein." } },
];

export const GLOSS_MS = 320; // one gloss every 320 ms, like the real model's step
export const MOCK_LATENCY_MS = 320; // the badge in the mockups says 0.32 s

/** The fixed sentence for a finished mock line, or undefined if the line is not from the script. */
export function mockSentence(line: Pick<CaptionLine, "de">, lang: Lang): string | undefined {
  return MOCK_TURNS.find((t) => t.glosses.map((g) => g[0]).join(" ") === line.de)?.sentence[lang];
}

export interface MockApi {
  running: boolean;
  lines: CaptionLine[];
  start(): void;
  stop(): void;
  /** Plays the next turn of the dialogue (called after the staff reply). */
  next(): void;
  onLineFinal(cb: (line: CaptionLine) => void): () => void;
}

export function useMockSigner(): MockApi {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const timers = useRef<number[]>([]);
  const listeners = useRef(new Set<(l: CaptionLine) => void>());
  const turn = useRef(0);
  const nextId = useRef(1);
  const runningRef = useRef(false);
  const busy = useRef(false); // a turn is being played

  const clear = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  const later = useCallback((ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); }, []);

  const playTurn = useCallback((i: number) => {
    const t = MOCK_TURNS[i % MOCK_TURNS.length]!;
    turn.current = (i + 1) % MOCK_TURNS.length;
    const id = nextId.current++;
    busy.current = true;
    const shown: Array<[string, string]> = [];
    const line = (final: boolean): CaptionLine => ({ id, de: shown.map((g) => g[0]).join(" "), en: shown.map((g) => g[1]).join(" · "), final });
    setLines((ls) => [...ls, line(false)]);
    t.glosses.forEach((g, k) => later((k + 1) * GLOSS_MS, () => { shown.push(g); setLines((ls) => ls.map((l) => (l.id === id ? line(false) : l))); }));
    later((t.glosses.length + 1) * GLOSS_MS + 500, () => {
      const done = line(true);
      busy.current = false;
      setLines((ls) => ls.map((l) => (l.id === id ? done : l)));
      listeners.current.forEach((cb) => cb(done));
    });
  }, [later]);

  const stop = useCallback(() => { clear(); busy.current = false; runningRef.current = false; setRunning(false); }, [clear]);
  const start = useCallback(() => {
    clear();
    setLines([]);
    nextId.current = 1;
    runningRef.current = true;
    setRunning(true);
    later(400, () => playTurn(0));
  }, [clear, later, playTurn]);
  const next = useCallback(() => { if (runningRef.current && !busy.current) later(1200, () => playTurn(turn.current)); }, [later, playTurn]);
  const onLineFinal = useCallback((cb: (l: CaptionLine) => void) => { listeners.current.add(cb); return () => { listeners.current.delete(cb); }; }, []);
  useEffect(() => clear, [clear]);

  return { running, lines, start, stop, next, onLineFinal };
}
