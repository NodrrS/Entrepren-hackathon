import { useRef, useState } from "react";
import { Gauge, House, Link2, Loader2, Play, RefreshCw, Smartphone, Square, Upload, Video, Volume2, VolumeX } from "lucide-react";
import type { Crop } from "@/lib/recognizer";
import { QUICK_COUNTER } from "@/lib/replies";
import type { Session } from "@/lib/useSession";
import { fetchVideo } from "@/lib/videoLink";
import { cn } from "@/lib/utils";
import { Captions } from "./Captions";
import { Equalizer, LangToggle, Pill, SOURCE_NOTES, SourceToggle, Switch, VoiceToggle } from "./Controls";
import { Conversation, type Bubble } from "./Conversation";
import { CustomerView } from "./CustomerView";
import { HoldToSpeak } from "./HoldToSpeak";
import { HowItWorks } from "./HowItWorks";
import { Logo } from "./Logo";
import { MockFigure } from "./MockFigure";
import { Stage } from "./Stage";
import { LatencyPanel } from "./LatencyPanel";
import { setDebug, useDebug } from "@/lib/metrics";

const SECTION = "text-[13px] font-semibold tracking-[0.06em] text-muted-foreground uppercase";

// The three recorded clips in demo-clips.json, in file order.
const EXAMPLES = ["Tomorrow's date", "Forecast intro", "Night temperatures"];

const CROP_LABELS: Array<[Crop, string]> = [
  ["whole", "Whole frame"],
  ["right", "Right half"],
  ["left", "Left half"],
  ["bottom-right", "Bottom-right corner"],
  ["bottom-left", "Bottom-left corner"],
];

/** The counter (tablet) view: mockup 4 for staff, mockup 5 ("Show to customer") for the signer. */
export function CounterApp({ s, onSigner }: { s: Session; onSigner: () => void }) {
  const r = s.real;
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [customer, setCustomer] = useState(false);
  const [example, setExample] = useState<number | null>(null);
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [crop, setCrop] = useState<Crop>("whole");
  const fileRef = useRef<HTMLInputElement>(null);
  const debug = useDebug();
  /** Home: back to the start of the counter view (stops the session, clears the conversation). */
  const goHome = () => {
    s.stop(); s.reset();
    setCustomer(false); setInfo(false); setErr(null); setProblem(null);
    scrollTo({ top: 0 });
  };

  // A new source starts a new conversation: nothing from the last one is kept.
  const run = (fn: () => Promise<void>) => {
    setErr(null);
    setProblem(null);
    s.reset();
    fn().catch(() => setErr("That source could not be started. Check camera permissions or try another clip."));
  };
  const onFile = (f?: File | null) => { if (f && f.type.startsWith("video/")) run(() => r.startUpload(f, crop)); };
  const translateLink = async () => {
    if (!link.trim() || fetching) return;
    setErr(null);
    setFetching(true);
    try {
      const file = await fetchVideo(link);
      run(() => r.startUpload(file, crop));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setFetching(false);
    }
  };
  const send = (text: string) => { setProblem(null); s.sendReply(text); };

  const bubbles: Bubble[] = s.messages.map((m) => {
    const st = m.lineId === undefined ? undefined : s.sentences[m.lineId];
    return { key: m.key, who: m.who, text: typeof st === "object" ? st.text : st === "pending" ? "…" : m.text };
  });
  const newest = s.lines.at(-1);
  const stageLabel = s.source === "weather"
    ? s.weatherWaiting && s.weatherClip !== null ? `Weather forecast · paused after clip ${s.weatherClip + 1} of 3`
      : s.weatherClip !== null ? `Weather forecast · clip ${s.weatherClip + 1} of 3` : s.forecastDone ? "Forecast finished" : s.ready ? "Ready" : "Loading the model…"
    : s.useMock
    ? s.running ? "Scripted example playing" : "Ready"
    : r.mode === "camera" ? "Signing live" : r.mode === "demo" ? `Example ${(example ?? 0) + 1} playing` : r.mode === "upload" ? "Reading your clip" : s.ready ? "Ready" : "Loading the model…";
  const allUp = s.ready && s.voiceOk && s.llmOk;
  const who = s.useMock ? "Pharmacy says" : "Staff says";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-[72px] shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-hairline px-4 py-3 sm:px-7">
        <button type="button" onClick={goHome} aria-label="Home" className="rounded-lg"><Logo className="h-8 w-auto" /></button>
        {s.useMock && <span className="hidden rounded-[14px] bg-secondary px-3 py-1.5 text-[15px] font-semibold md:inline">Apotheke am Markt · Counter 1</span>}
        <span className="rounded-[14px] bg-secondary px-3 py-1.5 text-[15px] font-semibold">Research demo</span>
        <span className="hidden rounded-[14px] bg-info-soft px-3 py-1.5 text-sm font-semibold text-info-ink sm:inline">{s.useMock ? "Pharmacy vocabulary" : "Weather vocabulary · DGS"}</span>
        <div className="flex-1" />
        <button type="button" onClick={goHome} className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-link underline hover:text-link/80">
          <House className="h-4 w-4" aria-hidden="true" /> Home
        </button>
        <button type="button" onClick={() => setDebug(!debug)} aria-pressed={debug} className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-link underline hover:text-link/80">
          <Gauge className="h-4 w-4" aria-hidden="true" /> Latency
        </button>
        <button type="button" onClick={onSigner} className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-link underline hover:text-link/80">
          <Smartphone className="h-4 w-4" aria-hidden="true" /> Phone view
        </button>
        <button type="button" onClick={() => setInfo(!info)} aria-expanded={info} aria-controls="how-it-works"
          className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-link underline hover:text-link/80">
          {!allUp && <span className="h-2 w-2 rounded-full bg-warn" aria-label="A service is not ready" />}
          How it works
        </button>
        <span className="hidden text-sm text-muted-foreground lg:inline">Nothing is recorded or uploaded.</span>
      </header>

      {info && (
        <section id="how-it-works" aria-labelledby="how-h" className="shrink-0 border-b border-hairline bg-secondary px-4 py-6 sm:px-7">
          <div className="mx-auto max-w-6xl space-y-5">
            <h2 id="how-h" className="font-display text-xl font-bold">How it works</h2>
            <HowItWorks modelOk={s.ready} llmOk={s.llmOk} voiceOk={s.voiceOk} />
            <div className="grid gap-4 text-[15px] md:grid-cols-2">
              <p><strong>Privacy.</strong> Your video never leaves your device. Only the recognised words are sent, to our own server, to write the sentence and speak it. Staff speech is sent to our own server to be written down and is not stored.</p>
              <p><strong>Honest limits.</strong> Research demo. The sign model was trained on German Sign Language weather forecasts (PHOENIX-2014, non-commercial research use) and knows about 1,200 signs, so everyday signing will mostly give wrong or no words. Not for medical, legal or emergency use.</p>
            </div>
          </div>
        </section>
      )}

      <main className="flex flex-1 flex-col gap-6 px-4 pt-4 pb-8 sm:px-7 lg:grid lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)] lg:pt-6 lg:pb-7">
        <div className="flex min-h-0 flex-col gap-5">
          <Stage
            className="flex-1 lg:min-h-[38rem]"
            videoRef={r.videoRef}
            canvasRef={r.canvasRef}
            running={s.running}
            hint={!s.running && !newest}
            label={stageLabel}
            showSkeleton={r.showSkeleton}
            onToggleSkeleton={() => r.setShowSkeleton(!r.showSkeleton)}
            drag={drag}
            dropHandlers={{
              onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (!s.useMock) setDrag(true); },
              onDragLeave: () => setDrag(false),
              onDrop: (e: React.DragEvent) => { e.preventDefault(); setDrag(false); if (!s.useMock) onFile(e.dataTransfer.files[0]); },
            }}
            figure={s.useMock ? <MockFigure active={s.running} className="absolute inset-0 h-full w-full" /> : undefined}
            caption={<Captions line={newest} sentence={newest ? s.sentences[newest.id] : undefined} lang={s.lang} />}
          />

          <section aria-labelledby="session-h" className="space-y-2">
            <h2 id="session-h" className={SECTION}>Conversation</h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {s.running ? (
                <>
                  <Pill variant="primary" onClick={s.stop}><Square className="h-4 w-4" />Stop</Pill>
                  {s.source === "weather" && s.weatherWaiting && (
                    <Pill onClick={s.nextClip}><Play className="h-4 w-4" />Next clip ({(s.weatherClip ?? 0) + 2} of 3)</Pill>
                  )}
                </>
              ) : (
                <Pill variant="primary" disabled={!s.ready} onClick={() => run(() => s.start())}>
                  <Video className="h-4 w-4" />{!s.ready ? `Loading the model… ${Math.round(r.progress * 100)}%` : { camera: "Start camera", weather: "Play the forecast", pharmacy: "Start example" }[s.source]}
                </Pill>
              )}
              <SourceToggle value={s.source} onChange={s.setSource} className="w-full max-w-md" />
            </div>
            <p className="m-0 text-sm text-muted-foreground">{SOURCE_NOTES[s.source]}.{s.source !== "camera" && " Choose Live camera to sign yourself, play single clips or use your own video."}</p>
          </section>

          {s.source === "camera" && (
            <>
              <section aria-labelledby="examples-h" className="space-y-2">
                <h2 id="examples-h" className={SECTION}>Examples</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {EXAMPLES.map((label, i) => (
                    <Pill key={label} disabled={!s.ready} aria-pressed={r.mode === "demo" && example === i} className="justify-start gap-3 px-3"
                      onClick={() => { setExample(i); run(() => r.startDemo(i)); }}>
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold" aria-hidden="true">{i + 1}</span>
                      <span className="leading-tight text-left">{label}</span>
                    </Pill>
                  ))}
                </div>
              </section>

              <section aria-labelledby="own-h" className="space-y-2">
                <h2 id="own-h" className={SECTION}>Your own video</h2>
                {s.linksOk && (
                  <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void translateLink(); }}>
                    <label htmlFor="video-link" className="sr-only">YouTube link to translate</label>
                    <input id="video-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a YouTube link (up to 3 minutes)…" autoComplete="off"
                      className="h-12 min-w-0 flex-1 rounded-[14px] border border-border bg-card px-4 text-base placeholder:text-muted-foreground" />
                    <Pill type="submit" disabled={!s.ready || fetching || !link.trim()}>
                      {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                      {fetching ? "Getting…" : "Translate"}
                    </Pill>
                  </form>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Pill disabled={!s.ready} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Upload a video file</Pill>
                  <input ref={fileRef} type="file" accept="video/*" className="sr-only" tabIndex={-1} aria-label="Upload a video clip" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
                  <label className="ml-auto inline-flex items-center gap-2 text-[15px] text-muted-foreground">
                    <span>Signer is in</span>
                    <select value={crop} onChange={(e) => setCrop(e.target.value as Crop)} aria-label="Signer position in a video"
                      className="h-12 rounded-[14px] border border-border bg-card px-3 text-[15px] font-medium text-foreground">
                      {CROP_LABELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </label>
                </div>
              </section>
            </>
          )}

          <section aria-labelledby="speech-h" className="space-y-1">
            <h2 id="speech-h" className={SECTION}>Speech</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <LangToggle value={s.lang} onChange={s.setLang} label="Spoken language" />
              <VoiceToggle value={s.voice} onChange={s.setVoice} />
              <Switch checked={s.speakOn} onChange={s.setSpeakOn} label="Speak captions" />
              <button type="button" onClick={() => s.setMuted(!s.muted)} aria-pressed={s.muted} aria-label={s.muted ? "Unmute" : "Mute"}
                className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] border border-border bg-card hover:bg-accent">
                {s.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <Equalizer active={s.playing && !s.muted} />
            </div>
          </section>

          {debug && <LatencyPanel />}

          {!s.useMock && (
            <div aria-live="polite" className="space-y-2">
              <p className={cn("min-h-5 text-sm", err ? "text-destructive" : "text-muted-foreground")}>{err ?? r.statusText}</p>
              <div className="h-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Model download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.progress * 100)}>
                <div className={cn("h-full rounded-full bg-primary transition-[width,opacity]", s.ready && "opacity-0")} style={{ width: `${r.progress * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* On wide screens the conversation fills exactly the height of the left column and scrolls inside. */}
        <div className="relative lg:min-h-0">
          <Conversation
            className="lg:absolute lg:inset-0"
            bubbles={bubbles}
            quick={QUICK_COUNTER[s.lang]}
            onSend={send}
            mic={<HoldToSpeak variant="round" lang={s.lang} onText={send} onProblem={setProblem} />}
            notice={problem}
            action={
              <Pill variant="primary" className="min-h-14 w-full text-lg" disabled={!s.reply} onClick={() => setCustomer(true)} title={s.reply ? undefined : "Send a reply first"}>
                <RefreshCw className="h-5 w-5" />Show to customer
              </Pill>
            }
          />
        </div>
      </main>

      {customer && s.reply && (
        <CustomerView
          reply={s.reply}
          pictures={s.pictures}
          onTogglePictures={() => s.setPictures(!s.pictures)}
          title={who}
          onClose={() => setCustomer(false)}
          onSign={() => { setCustomer(false); if (!s.running) run(() => s.start()); }}
        />
      )}
    </div>
  );
}
