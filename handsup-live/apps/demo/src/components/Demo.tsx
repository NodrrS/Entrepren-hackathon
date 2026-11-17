import { useEffect, useRef, useState } from "react";
import { Camera, Link2, Loader2, Play, Square, Upload, Volume2, VolumeX } from "lucide-react";
import { useRecognizer, type CaptionLine, type Crop, type Lang } from "@/lib/recognizer";
import { checkHealth } from "@/lib/speech";
import { rewrite } from "@/lib/rewrite";
import { fetchVideo } from "@/lib/videoLink";
import { cn } from "@/lib/utils";
import { Captions, rawWords, type SentenceState } from "./Captions";
import { Chip, Equalizer, LangToggle, Pill, Switch } from "./Controls";
import { Conversation, type Bubble } from "./Conversation";
import { Logo } from "./Logo";
import { Stage } from "./Stage";
import { useSpeechQueue } from "./useSpeechQueue";

// The four quick replies of mockup 4, in both spoken languages.
const QUICK: Record<Lang, string[]> = {
  en: ["Prescription?", "This costs €6.50", "1 tablet, up to 3× a day", "One moment please"],
  de: ["Rezept?", "Das kostet 6,50 €", "1 Tablette, bis zu 3× täglich", "Einen Moment bitte"],
};

// The three recorded clips in demo-clips.json, in file order (glosses: see the file's `reference` lists).
const EXAMPLES = ["Tomorrow's date", "Forecast intro", "Night temperatures"];

const CROP_LABELS: Array<[Crop, string]> = [
  ["whole", "Whole frame"],
  ["right", "Right half"],
  ["left", "Left half"],
  ["bottom-right", "Bottom-right corner"],
  ["bottom-left", "Bottom-left corner"],
];

/** Raw words for a rewrite request: the glosses, plus the model's rough English hints for the English prompt. */
function rewriteInput(line: CaptionLine, lang: Lang) {
  return { glosses: line.de, hints: lang === "en" ? line.en.replace(/\s+/g, " ").trim() : "" };
}

interface Message extends Bubble {
  lineId?: number;
}

export function Demo() {
  const r = useRecognizer();
  const [lang, setLang] = useState<Lang>("en");
  const [speakOn, setSpeakOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [llmOk, setLlmOk] = useState(false);
  const [sentences, setSentences] = useState<Record<number, SentenceState>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [example, setExample] = useState<number | null>(null);
  const [linksOk, setLinksOk] = useState(false);
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [crop, setCrop] = useState<Crop>("whole");
  const linkAbort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { enqueue, playing } = useSpeechQueue(muted);
  const settings = useRef({ lang, speakOn, llmOk });
  settings.current = { lang, speakOn, llmOk };
  const latest = useRef<CaptionLine[]>([]);
  latest.current = r.lines;
  // Finished lines are rewritten and spoken strictly in order: each waits for the one before it.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const lastFail = useRef(0);

  useEffect(() => {
    const poll = () => checkHealth().then((h) => { setVoiceOk(h.voice); setLlmOk(h.llm); setLinksOk(h.links); });
    poll();
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => r.onLineFinal((line) => {
    chain.current = chain.current.then(async () => {
      const { lang: l, speakOn: speak, llmOk: llm } = settings.current;
      let text = rawWords(line, l);
      setMessages((m) => [...m, { key: `line-${line.id}`, who: "signer", text, lineId: line.id }]);
      // Always try the rewrite (a cached health flag can be stale). After a failure, skip it for 15 s so an
      // outage does not delay every spoken line by the request timeout.
      if (llm || Date.now() - lastFail.current > 15_000) {
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
  }), [r.onLineFinal, enqueue]);

  // Switching the language rewrites the newest finished line again so the caption matches (it is not spoken again).
  useEffect(() => {
    const line = [...latest.current].reverse().find((x) => x.final);
    if (!line || !settings.current.llmOk) return;
    const cur = sentences[line.id];
    if (typeof cur !== "object" || cur.lang === lang) return;
    const { glosses, hints } = rewriteInput(line, lang);
    rewrite(glosses, hints, lang)
      .then((out) => setSentences((s) => ({ ...s, [line.id]: { text: out.sentence, ms: out.ms, lang } })))
      .catch(() => {});
  }, [lang]);

  const ready = r.phase === "ready";
  const running = r.mode !== "idle";
  // A new source starts a new conversation: nothing from the last one is kept.
  const run = (fn: () => Promise<void>) => {
    setErr(null);
    setMessages([]);
    setSentences({});
    fn().catch(() => setErr("That source could not be started. Check camera permissions or try another clip."));
  };
  const onFile = (f?: File | null) => { if (f && f.type.startsWith("video/")) run(() => r.startUpload(f, crop)); };
  const translateLink = async () => {
    if (!link.trim() || fetching) return;
    setErr(null);
    setFetching(true);
    const ac = (linkAbort.current = new AbortController());
    try {
      const file = await fetchVideo(link, ac.signal);
      run(() => r.startUpload(file, crop));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message);
    } finally {
      setFetching(false);
    }
  };
  const speakReply = (text: string) => {
    setMessages((m) => [...m, { key: `reply-${Date.now()}-${m.length}`, who: "staff", text }]);
    enqueue(text, settings.current.lang);
  };

  const bubbles: Bubble[] = messages.map((m) => {
    const s = m.lineId === undefined ? undefined : sentences[m.lineId];
    return { key: m.key, who: m.who, text: typeof s === "object" ? s.text : s === "pending" ? "…" : m.text };
  });
  const newest = r.lines.at(-1);
  const stageLabel = r.mode === "camera" ? "Signing live" : r.mode === "demo" ? `Example ${(example ?? 0) + 1} playing` : r.mode === "upload" ? "Reading your clip" : ready ? "Ready" : "Loading the model…";
  const allUp = ready && voiceOk && llmOk;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex min-h-[72px] shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-hairline px-4 py-3 sm:px-7">
        <Logo className="h-8 w-auto" />
        <span className="rounded-[14px] bg-secondary px-3 py-1.5 text-[15px] font-semibold">Research demo</span>
        <span className="hidden rounded-[14px] bg-info-soft px-3 py-1.5 text-sm font-semibold text-info-ink sm:inline">Weather vocabulary · DGS</span>
        <div className="flex-1" />
        <button type="button" onClick={() => setInfo(!info)} aria-expanded={info} aria-controls="how-it-works"
          className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-link underline hover:text-link/80">
          {!allUp && <span className="h-2 w-2 rounded-full bg-warn" aria-label="A service is not ready" />}
          How it works
        </button>
        <span className="hidden text-sm text-muted-foreground lg:inline">Nothing is recorded or uploaded.</span>
      </header>

      {info && (
        <section id="how-it-works" className="shrink-0 border-b border-hairline bg-secondary px-4 py-5 sm:px-7">
          <div className="mx-auto grid max-w-5xl gap-4 text-[15px] md:grid-cols-2">
            <div className="space-y-2">
              <h2 className="font-display text-lg font-bold">How it works</h2>
              <p>The camera and the sign model run on your device, so your video never leaves it. Each finished line of signs (shown small, in sign order) is sent as words only to our own server, where an AI model writes one natural sentence. The sentence is shown large and spoken aloud.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Chip ok={ready}>Model ready</Chip>
                <Chip ok={voiceOk}>Voice ready</Chip>
                <Chip ok={llmOk}>Sentences ready</Chip>
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-lg font-bold">Honest limits</h2>
              <p>Research demo. The sign model was trained on German Sign Language weather forecasts (PHOENIX-2014, non-commercial research use) and knows about 1,200 signs, so everyday signing will mostly give wrong or no words. Not for medical, legal or emergency use.</p>
            </div>
          </div>
        </section>
      )}

      <main className="flex min-h-0 flex-1 flex-col gap-6 px-4 pt-4 pb-8 sm:px-7 lg:grid lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:pt-6 lg:pb-7">
        <div className="flex min-h-0 flex-col gap-4">
          <Stage
            className="flex-1 lg:min-h-[20rem]"
            videoRef={r.videoRef}
            canvasRef={r.canvasRef}
            running={running}
            hint={!running && !newest}
            label={stageLabel}
            showSkeleton={r.showSkeleton}
            onToggleSkeleton={() => r.setShowSkeleton(!r.showSkeleton)}
            drag={drag}
            dropHandlers={{
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDrag(true); },
              onDragLeave: () => setDrag(false),
              onDrop: (e: React.DragEvent) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); },
            }}
            caption={<Captions line={newest} sentence={newest ? sentences[newest.id] : undefined} lang={lang} />}
          />

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Examples">
            <span className="mr-1 text-[13px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Examples</span>
            {EXAMPLES.map((label, i) => (
              <Pill key={label} disabled={!ready} aria-pressed={r.mode === "demo" && example === i}
                onClick={() => { setExample(i); run(() => r.startDemo(i)); }}>
                <Play className="h-4 w-4" />{i + 1} · {label}
              </Pill>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Pill disabled={!ready} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Upload clip</Pill>
            <input ref={fileRef} type="file" accept="video/*" className="sr-only" tabIndex={-1} aria-label="Upload a video clip" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <label className="inline-flex items-center gap-2 text-[15px] text-muted-foreground">
              <span>Signer</span>
              <select value={crop} onChange={(e) => setCrop(e.target.value as Crop)} aria-label="Signer position in an uploaded video"
                className="h-12 rounded-[14px] border border-border bg-card px-3 text-[15px] font-medium text-foreground">
                {CROP_LABELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <LangToggle value={lang} onChange={setLang} label="Spoken language" />
            <Switch checked={speakOn} onChange={setSpeakOn} label="Speak captions" />
            <button type="button" onClick={() => setMuted(!muted)} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"}
              className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] border border-border bg-card hover:bg-accent">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <Equalizer active={playing && !muted} />
          </div>

          {linksOk && (
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void translateLink(); }}>
              <label htmlFor="video-link" className="sr-only">YouTube link to translate</label>
              <input id="video-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a YouTube link (up to 3 minutes)…" autoComplete="off"
                className="h-12 min-w-0 flex-1 rounded-[14px] border border-border bg-card px-4 text-base placeholder:text-muted-foreground" />
              <Pill type="submit" disabled={!ready || fetching || !link.trim()}>
                {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {fetching ? "Getting the video…" : "Translate video"}
              </Pill>
            </form>
          )}

          <div aria-live="polite" className="space-y-2">
            <p className={cn("min-h-5 text-sm", err ? "text-destructive" : "text-muted-foreground")}>{err ?? r.statusText}</p>
            <div className="h-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Model download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.progress * 100)}>
              <div className={cn("h-full rounded-full bg-primary transition-[width,opacity]", ready && "opacity-0")} style={{ width: `${r.progress * 100}%` }} />
            </div>
          </div>
        </div>

        <Conversation
          className="lg:min-h-0"
          bubbles={bubbles}
          quick={QUICK[lang]}
          onSpeak={speakReply}
          action={
            running ? (
              <Pill variant="primary" className="min-h-14 w-full text-lg" onClick={r.stop}><Square className="h-5 w-5" />Stop</Pill>
            ) : (
              <Pill variant="primary" className="min-h-14 w-full text-lg" disabled={!ready} onClick={() => run(r.startCamera)}><Camera className="h-5 w-5" />Start camera</Pill>
            )
          }
        />
      </main>
    </div>
  );
}
