import { Check, RotateCcw, SkipForward, Square } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { TURNS, type usePharmacy } from "@/lib/pharmacy/usePharmacy";
import type { Lang } from "@/lib/recognizer";
import type { SentenceState } from "../Captions";
import { Pill, Switch } from "../Controls";

type Ph = ReturnType<typeof usePharmacy>;

/** Pharmacy (DGS) guided scenario: turn buttons, the expected steps, Weiter, Assistenz and a tuning strip. */
export function GuidedPanel({ ph, disabled, onRestart, className }: { ph: Ph; disabled: boolean; onRestart?: (() => void) | undefined; className?: string | undefined }) {
  const [details, setDetails] = useState(false);
  const { turn, index, marks, debug } = ph.state;
  return (
    <section aria-labelledby="guided-h" className={cn("space-y-3 rounded-[18px] border border-border bg-card p-4", className)}>
      <h2 id="guided-h" className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Apotheke · DGS · Geführtes Szenario</h2>
      <p className="m-0 text-sm text-muted-foreground">
        Erkennt einfache Merkmale der erwarteten Gebärden (Hand am Kopf, vor der Brust, Bewegung), fließend ohne Pausen.
        Schritte mit „~“ zählen jede deutliche Gebärde; Assistenz geht nach 3 s Gebärden einen Schritt weiter. Keine freie Erkennung.
      </p>
      <div className="flex flex-wrap gap-2">
        {TURNS.map((t, i) => (
          <Pill key={t.title} variant={i === 0 ? "primary" : "ghost"} disabled={disabled} onClick={() => void ph.startTurn(t)}>
            {i === 0 ? "▶ Teil 1: Kundin" : "▶ Teil 3: „Danke“"}
          </Pill>
        ))}
        <Pill variant="primary" disabled={!ph.active} onClick={ph.finish} title="End the turn: the signs so far become a sentence and are spoken"><Check className="h-4 w-4" />Done</Pill>
        <Pill disabled={!ph.active} onClick={ph.skip}><SkipForward className="h-4 w-4" />Weiter</Pill>
        <Pill disabled={!ph.active} onClick={ph.stopTurn}><Square className="h-4 w-4" />Beenden</Pill>
        {onRestart && <Pill onClick={onRestart} title="Start the scenario again from part 1, with an empty conversation"><RotateCcw className="h-4 w-4" />Neu starten</Pill>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4">
        <Switch checked={ph.assist} onChange={ph.setAssist} label="Assistenz" />
        <Switch checked={details} onChange={setDetails} label="Details" />
      </div>
      {turn && (
        <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Erwartete Gebärden">
          {turn.steps.map((st, i) => {
            const m = marks[i];
            return (
              <li key={`${st.gloss}-${i}`} className={cn("rounded-full px-3 py-1 text-sm font-semibold",
                m === "ok" ? "bg-ok text-white" : m === "loose" ? "bg-ok/60 text-white" : m === "skip" ? "bg-warn/70 text-foreground" : i === index ? "bg-foreground text-background ring-2 ring-primary" : "bg-secondary text-muted-foreground")}>
                {st.gloss}{m === "ok" ? " ✓" : m === "loose" ? " ~" : m === "skip" ? " ⏭" : ""}
              </li>
            );
          })}
        </ol>
      )}
      {turn && index < turn.steps.length && (
        <p className="m-0 text-[15px] font-semibold text-destructive">Jetzt: {turn.steps[index]!.gloss} ({turn.steps[index]!.hint})</p>
      )}
      {details && debug && (
        <p className="m-0 rounded-lg bg-stage px-3 py-2 font-mono text-xs text-white/80">
          Hände {debug.hands} · Hand–Kopf {Number.isFinite(debug.headDist) ? debug.headDist.toFixed(2) : "–"} · Bewegung {(debug.motion * 100).toFixed(1)} · Schritt {debug.step}
        </p>
      )}
    </section>
  );
}

/** The scenario words so far, for the stage's caption area. */
/** The caption while a guided turn runs; when it is done, the LLM's sentence (or the written one as a fallback). */
export function GuidedCaption({ ph, sentence }: { ph: Ph; sentence?: SentenceState | undefined; lang?: Lang }) {
  const { turn, index, marks } = ph.state;
  if (!turn) return <div className="min-h-16 rounded-[14px] bg-white/10 px-4 py-3 text-[15px] text-white/60">Teil 1 starten, dann die Gebärden der Kundin zeigen.</div>;
  const said = turn.steps.slice(0, index);
  const finished = index >= turn.steps.length;
  return (
    <div className="min-h-16 space-y-1 rounded-[14px] bg-white px-4 py-3 text-foreground">
      <p className="m-0 flex flex-wrap gap-x-2 font-display text-xl font-bold">
        {said.length ? said.map((st, i) => <span key={`${st.gloss}-${i}`} className={cn(marks[i] === "skip" && "text-muted-foreground")}>{st.de}</span>) : <span className="text-muted-foreground">…</span>}
      </p>
      {finished && (typeof sentence === "object" ? (
        <div className="flex items-start justify-between gap-3">
          <p className="m-0 animate-word-in font-display text-[2rem] leading-[1.1] font-bold break-words">{sentence.text}</p>
          <span className="shrink-0 rounded-xl bg-ok-soft px-2.5 py-1 text-[13px] font-semibold text-ok-ink tabular-nums" title="Time to write the sentence">{(sentence.ms / 1000).toFixed(2)} s</span>
        </div>
      ) : sentence === "pending" ? (
        <p className="m-0 font-display text-[2rem] font-bold text-muted-foreground" role="status"><span className="sr-only">Writing the sentence</span><span aria-hidden="true">…</span></p>
      ) : (
        <p className="m-0 text-[15px]">{turn.de}</p>
      ))}
    </div>
  );
}
