import { useEffect, useRef, useState } from "react";
import { Camera, Upload, Play, Square, Volume2, VolumeX } from "lucide-react";
import { useRecognizer, type Lang } from "@/lib/recognizer";
import { checkVoice } from "@/lib/speech";
import { Card, Chip, Equalizer, LangToggle, Pill, Switch } from "./Controls";
import { Captions } from "./Captions";
import { LogoMark } from "./Logo";
import { useSpeechQueue } from "./useSpeechQueue";
import { cn } from "@/lib/utils";

export function captionText(line: { de: string; en: string }, lang: Lang) {
  return lang === "en" ? line.en.replace(/[?·]/g, " ").replace(/\s+/g, " ").trim() : line.de.replace(/-/g, " ");
}

export function SignCard({ className }: { className?: string | undefined }) {
  const r = useRecognizer();
  const [lang, setLang] = useState<Lang>("en");
  const [speakOn, setSpeakOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { enqueue, playing } = useSpeechQueue(muted);
  const settings = useRef({ lang, speakOn });
  settings.current = { lang, speakOn };

  useEffect(() => { checkVoice().then(setVoiceOk).catch(() => setVoiceOk(false)); }, []);
  useEffect(() => r.onLineFinal((line) => {
    if (settings.current.speakOn) enqueue(captionText(line, settings.current.lang), settings.current.lang);
  }), [r.onLineFinal, enqueue]);

  const ready = r.phase === "ready";
  const running = r.mode !== "idle";
  const run = (fn: () => Promise<void>) => { setErr(null); fn().catch(() => setErr("That source could not be started. Check camera permissions or try another clip.")); };
  const onFile = (f?: File | null) => { if (f && f.type.startsWith("video/")) run(() => r.startUpload(f)); };

  return (
    <Card title="Sign → Speech" className={className}>
      <div
        className={cn("relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-stage", drag && "ring-2 ring-primary")}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
      >
        {/* Fit and mirroring (camera only) are set by the recognizer engine on both the video and the canvas, so they stay aligned. */}
        <video ref={r.videoRef} muted playsInline className="h-full w-full" />
        <canvas ref={r.canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
        {!running && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <LogoMark className="h-14 w-14 text-primary" />
            <p className="max-w-xs text-sm text-muted-foreground">Start your camera, upload a clip, or try the demo</p>
          </div>
        )}
        {r.mode === "demo" && <span className="absolute top-3 left-3 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Demo clip</span>}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Pill variant="primary" disabled={!ready} onClick={() => run(r.startCamera)}><Camera className="h-4 w-4" />Start camera</Pill>
        <Pill disabled={!ready} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Upload clip</Pill>
        <Pill disabled={!ready} onClick={() => run(r.startDemo)}><Play className="h-4 w-4" />Demo clip</Pill>
        {running && <Pill onClick={r.stop}><Square className="h-4 w-4" />Stop</Pill>}
        <input ref={fileRef} type="file" accept="video/*" className="sr-only" tabIndex={-1} aria-label="Upload a video clip" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="ml-auto"><Switch checked={r.showSkeleton} onChange={r.setShowSkeleton} label="Skeleton" /></div>
      </div>

      <div className="mt-5 space-y-2" aria-live="polite">
        <p className="min-h-5 text-sm text-muted-foreground">{err ?? r.statusText}</p>
        <div className="h-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Model download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.progress * 100)}>
          <div className={cn("h-full rounded-full bg-primary transition-[width,opacity]", ready && "opacity-0")} style={{ width: `${r.progress * 100}%` }} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Chip ok={ready}>Model ready</Chip>
          <Chip ok={voiceOk}>Voice ready</Chip>
        </div>
      </div>

      <div className="mt-5"><Captions lines={r.lines} /></div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <LangToggle value={lang} onChange={setLang} label="Spoken language" />
        <Switch checked={speakOn} onChange={setSpeakOn} label="Speak captions" />
        <button type="button" onClick={() => setMuted(!muted)} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary hover:bg-accent">
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <Equalizer active={playing && !muted} />
      </div>
    </Card>
  );
}
