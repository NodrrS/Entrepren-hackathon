import { useCallback, useEffect, useRef, useState } from "react";
import { rawWords, type SentenceState } from "@/components/Captions";
import { useSpeechQueue } from "@/components/useSpeechQueue";
import { MOCK_LATENCY_MS, mockSentence, useMockSigner } from "./mockSigner";
import { builtinReply, makeReply, type Reply } from "./replies";
import { rewrite } from "./rewrite";
import { checkHealth } from "./speech";
import { useRecognizer, type CaptionLine, type Lang } from "./recognizer";

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
  const [useMock, setUseMockState] = useState(false); // live camera by default; the scripted example is one tap away
  const [lang, setLang] = useState<Lang>("en");
  const [speakOn, setSpeakOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [llmOk, setLlmOk] = useState(false);
  const [linksOk, setLinksOk] = useState(false);
  const [sentences, setSentences] = useState<Record<number, SentenceState>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState<Reply | null>(null);
  const [pictures, setPictures] = useState(true); // reply style: pictures + simple text, or big text only
  const { enqueue, playing } = useSpeechQueue(muted);

  const settings = useRef({ lang, speakOn, llmOk, useMock });
  settings.current = { lang, speakOn, llmOk, useMock };
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
      const { lang: l, speakOn: speak, llmOk: llm, useMock: scripted } = settings.current;
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
          const out = await rewrite(inp.glosses, inp.hints, l);
          setSentences((s) => ({ ...s, [line.id]: { text: out.sentence, ms: out.ms, lang: l } }));
          text = out.sentence;
          setLlmOk(true);
        } catch {
          lastFail.current = Date.now();
          setLlmOk(false);
          setSentences((s) => ({ ...s, [line.id]: "failed" }));
        }
      }
      if (speak) enqueue(text, l);
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

  const reset = useCallback(() => { setMessages([]); setSentences({}); setReply(null); }, []);
  const stop = useCallback(() => { mock.stop(); real.stop(); }, [mock, real]);
  const setUseMock = useCallback((v: boolean) => { mock.stop(); real.stop(); reset(); setUseMockState(v); }, [mock, real, reset]);

  /** Starts a new conversation from the active source: the scripted dialogue, or the camera. */
  const start = useCallback(async () => {
    reset();
    if (settings.current.useMock) { real.stop(); mock.start(); return; }
    mock.stop();
    await real.startCamera();
  }, [mock, real, reset]);

  /** Staff answer (typed, spoken and transcribed, or a quick reply): becomes the reply the signer sees. */
  const sendReply = useCallback((text: string, opts?: { advance?: boolean }) => {
    const said = text.trim();
    if (!said) return;
    const { lang: l, useMock: scripted } = settings.current;
    setMessages((m) => [...m, { key: `reply-${Date.now()}-${m.length}`, who: "staff", text: said }]);
    const known = builtinReply(said, l);
    setReply(known ?? { said, sentence: "", tiles: [], loading: true });
    if (!known) void makeReply(said, l).then((r) => setReply((cur) => (cur && cur.said === said ? r : cur)));
    // In Mock mode the dialogue goes on after a reply (the phone flow does that itself, when the signer is back).
    if (scripted && opts?.advance !== false) mock.next();
  }, [mock]);

  return {
    real, mock, useMock, setUseMock,
    lang, setLang, speakOn, setSpeakOn, muted, setMuted, playing,
    voiceOk, llmOk, linksOk,
    lines, running: useMock ? mock.running : real.mode !== "idle", ready: useMock || real.phase === "ready",
    sentences, messages, reply, setReply, pictures, setPictures,
    start, stop, reset, sendReply, enqueue,
  };
}

export type Session = ReturnType<typeof useSession>;
