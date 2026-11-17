import { useCallback, useEffect, useRef, useState } from "react";
import { rawWords, type SentenceState } from "@/components/Captions";
import { useSpeechQueue } from "@/components/useSpeechQueue";
import { MOCK_LATENCY_MS, mockSentence, useMockSigner } from "./mockSigner";
import { builtinReply, makeReply, type Reply } from "./replies";
import { rewrite } from "./rewrite";
import { timed } from "./metrics";
import { checkHealth, type VoiceStyle } from "./speech";
import { usePharmacy, type Mark } from "./pharmacy/usePharmacy";
import { TURN_1, TURN_3, type GuidedTurn } from "./pharmacy/guided";
import { recognisedGlosses } from "./pharmacy/interpret";
import { stepsFor, type Step } from "./pharmacy/dgs";
import { textToSteps } from "./pharmacy/text";
import { useRecognizer, type CaptionLine, type Lang } from "./recognizer";

/** What is being translated: the live camera, the recorded weather forecast through the real model, or the scripted pharmacy dialogue. */
export type Source = "camera" | "weather" | "pharmacy";
/** The recorded forecast is the three clips in demo-clips.json, played back to back. */
export const WEATHER_CLIPS = 3;

/** The pharmacy (guided DGS) scenario is German: the recogniser's words, its sentences and the LLM output. */
export const PHARMACY_LANG: Lang = "de";

export interface Message {
  key: string;
  who: "signer" | "staff";
  text: string;
  lineId?: number;
}

/** Raw words for a rewrite request: the glosses, plus the model's rough English hints for the English prompt. */
function rewriteInput(line: CaptionLine, lang: Lang) {
  return { glosses: line.de, hints: lang === "en" ? line.en.replace(/\s+/g, " ").trim() : "" };
}

/**
 * Everything the two modes (signer phone flow and counter view) share: the sign source (scripted mock or the real
 * camera + model), finished lines rewritten into sentences and spoken in order, the conversation, and the staff
 * reply (built-in or LLM picture reply). The screens only render this.
 */
export function useSession() {
  const real = useRecognizer();
  const mock = useMockSigner();
  const [source, setSourceState] = useState<Source>("camera"); // live camera by default
  // "Pharmacy" runs the live camera with the guided DGS recogniser (usePharmacy, fc10 off), not the scripted mock.
  const useMock = false;
  // Weather forecast: which clip plays (0-based), or null when the forecast is not playing.
  const [weatherClip, setWeatherClip] = useState<number | null>(null);
  const [forecastDone, setForecastDone] = useState(false);
  // The forecast pauses after every clip and waits for "Next clip", so the presenter sets the pace.
  const [weatherWaiting, setWeatherWaiting] = useState(false);
  const weatherTimer = useRef<number | undefined>(undefined);
  const prevMode = useRef(real.mode);
  const [lang, setLang] = useState<Lang>("en");
  const [speakOn, setSpeakOn] = useState(true);
  const [voice, setVoice] = useState<VoiceStyle>("default"); // the default voice is the main one; the others only show it is real
  const [muted, setMuted] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [llmOk, setLlmOk] = useState(false);
  const [linksOk, setLinksOk] = useState(false);
  const [sentences, setSentences] = useState<Record<number, SentenceState>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState<Reply | null>(null);
  const [pictures, setPictures] = useState(true); // reply style: pictures + simple text, or big text only
  const { enqueue, playing } = useSpeechQueue(muted);
  // Pharmacy: guided DGS scenario on the camera; finished turns become signer sentences; staff answers play as DGS.
  // A finished turn's recognised signs (skipped steps left out) go through the LLM like any other line: the
  // sentence is shown and spoken in the chosen voice. If the LLM fails, or nothing was recognised, the turn's
  // written sentence is used instead.
  const interpretRef = useRef<(turn: GuidedTurn, marks: Mark[]) => void>(() => {});
  const nextTurn = useRef<GuidedTurn>(TURN_1);
  const ph = usePharmacy(real, (turn, marks) => {
    nextTurn.current = turn === TURN_1 ? TURN_3 : TURN_1;
    interpretRef.current(turn, marks);
  });
  const [dgs, setDgs] = useState<{ steps: Step[]; key: number }>({ steps: [], key: 0 });
  useEffect(() => { ph.setOn(source === "pharmacy"); if (source !== "pharmacy") ph.stopTurn(); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  const settings = useRef({ lang, speakOn, llmOk, useMock, voice });
  settings.current = { lang, speakOn, llmOk, useMock, voice };
  const lines = useMock ? mock.lines : real.lines;
  const latest = useRef<CaptionLine[]>([]);
  latest.current = lines;
  // Finished lines are rewritten and spoken strictly in order: each waits for the one before it.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const lastFail = useRef(0);

  useEffect(() => {
    const poll = () => checkHealth().then((h) => { setVoiceOk(h.voice); setLlmOk(h.llm); setLinksOk(h.links); });
    poll();
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, []);

  const subscribe = useMock ? mock.onLineFinal : real.onLineFinal;
  useEffect(() => subscribe((line) => {
    chain.current = chain.current.then(async () => {
      const { lang: l, speakOn: speak, llmOk: llm, useMock: scripted, voice: v } = settings.current;
      let text = rawWords(line, l);
      setMessages((m) => [...m, { key: `line-${line.id}`, who: "signer", text, lineId: line.id }]);
      const fixed = scripted ? mockSentence(line, l) : undefined;
      if (fixed) {
        setSentences((s) => ({ ...s, [line.id]: { text: fixed, ms: MOCK_LATENCY_MS, lang: l } }));
        text = fixed;
      } else if (llm || Date.now() - lastFail.current > 15_000) {
        // Always try the rewrite (a cached health flag can be stale). After a failure, skip it for 15 s so an
        // outage does not delay every spoken line by the request timeout.
        setSentences((s) => ({ ...s, [line.id]: "pending" }));
        try {
          const inp = rewriteInput(line, l);
          const out = await timed("sentence", rewrite(inp.glosses, inp.hints, l));
          setSentences((s) => ({ ...s, [line.id]: { text: out.sentence, ms: out.ms, lang: l } }));
          text = out.sentence;
          setLlmOk(true);
        } catch {
          lastFail.current = Date.now();
          setLlmOk(false);
          setSentences((s) => ({ ...s, [line.id]: "failed" }));
        }
      }
      if (speak) enqueue(text, l, v);
    });
  }), [subscribe, enqueue]);

  // Switching the language rewrites the newest finished line again so the caption matches (it is not spoken again).
  useEffect(() => {
    const line = [...latest.current].reverse().find((x) => x.final);
    if (!line) return;
    const cur = sentences[line.id];
    if (typeof cur !== "object" || cur.lang === lang) return;
    const fixed = settings.current.useMock ? mockSentence(line, lang) : undefined;
    if (fixed) { setSentences((s) => ({ ...s, [line.id]: { text: fixed, ms: MOCK_LATENCY_MS, lang } })); return; }
    if (!settings.current.llmOk) return;
    const { glosses, hints } = rewriteInput(line, lang);
    rewrite(glosses, hints, lang)
      .then((out) => setSentences((s) => ({ ...s, [line.id]: { text: out.sentence, ms: out.ms, lang } })))
      .catch(() => {});
  }, [lang]);

  // The forecast plays its clips back to back: when one clip ends, the next starts.
  useEffect(() => {
    const was = prevMode.current;
    prevMode.current = real.mode;
    if (weatherClip === null || was !== "demo" || real.mode !== "idle") return;
    const next = weatherClip + 1;
    if (next >= WEATHER_CLIPS) { setWeatherClip(null); setForecastDone(true); return; }
    setWeatherWaiting(true);
  }, [real.mode, weatherClip, real]);

  // Bumped on every reset: answers still on their way from before (an LLM sentence) are then dropped.
  const generation = useRef(0);
  /** A fresh conversation: nothing kept, the pharmacy scenario starts again at part 1, late answers are dropped. */
  const reset = useCallback(() => {
    generation.current++;
    setMessages([]); setSentences({}); setReply(null); setForecastDone(false); setPharmacySentence(undefined);
    nextTurn.current = TURN_1;
    setDgs((d) => ({ steps: [], key: d.key + 1 }));
  }, []);
  const stopWeather = useCallback(() => { clearTimeout(weatherTimer.current); setWeatherClip(null); setWeatherWaiting(false); }, []);
  /** Plays the next forecast clip (the forecast waits after each one). */
  const nextClip = useCallback(() => {
    if (!weatherWaiting || weatherClip === null) return;
    setWeatherWaiting(false);
    const next = weatherClip + 1;
    setWeatherClip(next);
    void real.startDemo(next);
  }, [weatherWaiting, weatherClip, real]);
  const stop = useCallback(() => { stopWeather(); mock.stop(); real.stop(); }, [mock, real, stopWeather]);
  const setSource = useCallback((v: Source) => { stopWeather(); mock.stop(); real.stop(); reset(); setSourceState(v); }, [mock, real, reset, stopWeather]);

  /** Starts a new conversation from the active source: the camera, the recorded forecast, or the scripted dialogue. */
  const start = useCallback(async () => {
    reset();
    stopWeather();
    if (source === "pharmacy") { mock.stop(); setDgs({ steps: [], key: 0 }); await ph.startTurn(nextTurn.current); return; }
    mock.stop();
    if (source === "weather") { setWeatherClip(0); await real.startDemo(0); return; }
    await real.startCamera();
  }, [mock, real, reset, source, stopWeather]);

  /** Staff answer (typed, spoken and transcribed, or a quick reply): becomes the reply the signer sees. */
  const sendReply = useCallback((text: string, opts?: { advance?: boolean }) => {
    let said = text.trim();
    if (!said) return;
    if (source === "pharmacy" && ph.data) {
      const answer = ph.data.sentences[1];
      const recipe = said === "Rezept-Antwort" && answer;
      const steps = recipe ? stepsFor(answer.glosses, ph.data) : textToSteps(said, ph.data);
      if (recipe) said = answer.de;
      setDgs((d) => ({ steps, key: d.key + 1 }));
    }
    const { lang: l, useMock: scripted } = settings.current;
    setMessages((m) => [...m, { key: `reply-${Date.now()}-${m.length}`, who: "staff", text: said }]);
    const known = builtinReply(said, l);
    setReply(known ?? { said, sentence: "", tiles: [], loading: true });
    if (!known) void makeReply(said, l).then((r) => setReply((cur) => (cur && cur.said === said ? r : cur)));
    // In Mock mode the dialogue goes on after a reply (the phone flow does that itself, when the signer is back).
    if (scripted && opts?.advance !== false) mock.next();
  }, [mock, source, ph.data]);

  /** A finished signer sentence from another recogniser: shown and spoken. */
  const say = useCallback((text: string, l: Lang) => {
    setMessages((m) => [...m, { key: `say-${Date.now()}-${m.length}`, who: "signer", text }]);
    if (settings.current.speakOn) enqueue(text, l, settings.current.voice);
  }, [enqueue]);

  // Pharmacy turns get negative ids so they never clash with the sign model's line ids in `sentences`.
  const pharmacyId = useRef(0);
  const [pharmacySentence, setPharmacySentence] = useState<SentenceState | undefined>(undefined);
  interpretRef.current = (turn, marks) => {
    const id = -++pharmacyId.current;
    const gen = generation.current;
    chain.current = chain.current.then(async () => {
      if (gen !== generation.current) return; // restarted meanwhile
      // The guided recogniser works in German (its words and its turn sentence are German), so the LLM writes
      // German too and the German voice speaks it, whatever the page language is.
      const { speakOn: speak, voice: v } = settings.current;
      const l: Lang = PHARMACY_LANG;
      const written = turn.de;
      const glosses = recognisedGlosses(turn, marks);
      let text = written;
      setMessages((m) => [...m, { key: `turn-${-id}`, who: "signer", text: written, lineId: id }]);
      if (glosses) {
        setSentences((s) => ({ ...s, [id]: "pending" }));
        setPharmacySentence("pending");
        try {
          const out = await timed("sentence", rewrite(glosses, "", l, undefined, "pharmacy"));
          if (gen !== generation.current) return; // restarted while the sentence was being written
          const done = { text: out.sentence, ms: out.ms, lang: l };
          setSentences((s) => ({ ...s, [id]: done }));
          setPharmacySentence(done);
          text = out.sentence;
          setLlmOk(true);
        } catch {
          setSentences((s) => ({ ...s, [id]: "failed" }));
          setPharmacySentence("failed");
        }
      }
      if (speak) enqueue(text, l, v);
    });
  };

  /** Pharmacy: the next guided turn (turn 3 after turn 1), keeping the conversation. */
  const nextPharmacyTurn = useCallback(() => { setPharmacySentence(undefined); return ph.startTurn(nextTurn.current); }, [ph]);
  /** Pharmacy: start over from part 1 with an empty conversation (the camera keeps running). */
  const restartPharmacy = useCallback(() => { ph.stopTurn(); reset(); }, [ph, reset]);

  return {
    say, ph, dgs, nextPharmacyTurn, restartPharmacy, pharmacySentence,
    real, mock, source, setSource, useMock, weatherClip, forecastDone, weatherWaiting, nextClip,
    voice, setVoice,
    lang, setLang, speakOn, setSpeakOn, muted, setMuted, playing,
    voiceOk, llmOk, linksOk,
    lines, running: useMock ? mock.running : real.mode !== "idle" || weatherClip !== null, ready: useMock || real.phase === "ready",
    sentences, messages, reply, setReply, pictures, setPictures,
    start, stop, reset, sendReply, enqueue,
  };
}

export type Session = ReturnType<typeof useSession>;
