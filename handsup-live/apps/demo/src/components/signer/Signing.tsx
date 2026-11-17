import { useState } from "react";
import { cn } from "@/lib/utils";
import { QUICK_PHONE } from "@/lib/replies";
import type { Session } from "@/lib/useSession";
import { rawWords } from "../Captions";
import { HoldToSpeak } from "../HoldToSpeak";
import { MockFigure } from "../MockFigure";

/**
 * Screen 2 of the signer flow (mockup 2). The top half is rotated 180° so the staff member on the other side of
 * the counter reads it; the bottom half faces the signer. It stays mounted (hidden) on the other screens so the
 * camera elements keep playing.
 */
export function Signing({ s, active, onReply, onEnd }: { s: Session; active: boolean; onReply: (text: string) => void; onEnd: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const newest = s.lines.at(-1);
  const sentence = newest ? s.sentences[newest.id] : undefined;
  const glosses = newest ? newest.de.split(" ").filter(Boolean) : [];

  return (
    <div className={cn("mx-auto h-dvh w-full max-w-[430px] flex-col overflow-hidden", active ? "flex" : "hidden")}>
      {/* For the staff: rotated half a turn */}
      <section className="flex h-[46%] shrink-0 rotate-180 flex-col gap-2 bg-card px-5 pt-4 pb-[max(1rem,env(safe-area-inset-top))]" aria-label="For staff">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-muted-foreground">For staff · Für das Personal</span>
          {typeof sentence === "object" && (
            <span className="rounded-xl bg-ok-soft px-2.5 py-1 text-[13px] font-semibold text-ok-ink tabular-nums">{(sentence.ms / 1000).toFixed(2)} s</span>
          )}
        </div>
        {glosses.length > 0 && <p className="m-0 truncate text-[13px] tracking-[0.08em] text-muted-foreground [font-variant:small-caps]">{glosses.join(" · ").toLowerCase()}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
          {typeof sentence === "object" ? (
            // Long sentences get a smaller size so they fit the staff half without scrolling.
            <p key={`${newest?.id}-${sentence.lang}`} className="m-0 animate-word-in font-display leading-[1.08] font-bold break-words"
              style={{ fontSize: sentence.text.length > 70 ? 22 : sentence.text.length > 45 ? 26 : 38 }}>{sentence.text}</p>
          ) : sentence === "pending" ? (
            <p className="m-0 font-display text-[38px] leading-[1.08] font-bold text-muted-foreground" role="status"><span className="sr-only">Writing the sentence</span><span aria-hidden="true">…</span></p>
          ) : newest?.final && newest ? (
            <p className="m-0 font-display text-3xl leading-[1.1] font-bold break-words text-muted-foreground">{rawWords(newest, s.lang)}</p>
          ) : (
            <p className="m-0 text-lg text-muted-foreground">{newest ? "Listening…" : "Waiting for signs…"}</p>
          )}
        </div>
        {problem && <p className="m-0 text-sm font-medium text-destructive" role="alert">{problem}</p>}
        <div className="flex gap-2 overflow-x-auto">
          {QUICK_PHONE[s.lang].map((q) => (
            <button key={q} type="button" onClick={() => { setProblem(null); onReply(q); }} className="min-h-11 shrink-0 rounded-full bg-panel px-4 text-[15px] font-medium whitespace-nowrap">{q}</button>
          ))}
        </div>
        <HoldToSpeak lang={s.lang} onText={(t) => { setProblem(null); onReply(t); }} onProblem={setProblem} className="h-14 text-lg">Hold to speak your answer</HoldToSpeak>
      </section>

      <div className="h-0.5 shrink-0 bg-primary" />

      {/* For the signer */}
      <section className="flex min-h-0 flex-1 flex-col gap-3 bg-stage p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-label="Your signs">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
            {s.source === "weather"
              ? s.forecastDone ? "Forecast finished" : s.weatherWaiting ? `Paused after clip ${(s.weatherClip ?? 0) + 1} of 3` : `Weather forecast · clip ${(s.weatherClip ?? 0) + 1} of 3`
              : "Reading your signs"}
          </span>
          <div className="flex gap-2">
            {s.source === "weather" && s.weatherClip !== null && (
              <button type="button" onClick={s.weatherWaiting || s.weatherPaused ? s.resumeWeather : s.pauseWeather} aria-pressed={s.weatherPaused}
                className="min-h-11 rounded-full bg-stage-chip px-4 text-[15px] font-semibold text-white">
                {s.weatherWaiting ? "Next clip" : s.weatherPaused ? "Don't pause" : "Pause"}
              </button>
            )}
            <button type="button" onClick={onEnd} className="min-h-11 rounded-full bg-white px-5 text-[15px] font-semibold text-ink">End</button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl">
          {/* Fit and mirroring (camera only) are set by the recognizer engine on both the video and the canvas, so they stay aligned. */}
          <video ref={s.real.videoRef} muted playsInline className={cn("absolute inset-0 h-full w-full", s.useMock && "invisible")} />
          <canvas ref={s.real.canvasRef} className={cn("pointer-events-none absolute inset-0 h-full w-full", s.useMock && "invisible")} aria-hidden="true" />
          {s.useMock && <MockFigure active={s.running} className="absolute inset-0 h-full w-full" />}
        </div>
        {!s.useMock && <p className="m-0 text-[13px] text-white/70" aria-live="polite">{s.real.statusText}</p>}
        <ul className="flex min-h-[2.25rem] flex-wrap gap-2" aria-label="Recognised signs">
          {glosses.map((g, i) => (
            <li key={`${i}-${g}`} className={cn("animate-word-in rounded-[10px] px-3 py-1.5 text-[15px]", i === glosses.length - 1 ? "bg-primary font-bold text-primary-foreground" : "bg-stage-chip font-semibold text-white")}>{g}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
