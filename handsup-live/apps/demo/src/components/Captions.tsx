import type { CaptionLine, Lang } from "@/lib/recognizer";

/** A finished line's rewrite: waiting for the LLM, failed (raw words are shown), or the sentence and how long it took. */
export type SentenceState = "pending" | "failed" | { text: string; ms: number; lang: Lang };

/** Raw words for a line when there is no sentence: the English hints, or the German glosses. */
export function rawWords(line: Pick<CaptionLine, "de" | "en">, lang: Lang) {
  return lang === "en" ? line.en.replace(/[?·]/g, " ").replace(/\s+/g, " ").trim() : line.de.replace(/-/g, " ");
}

const SENTENCE = "m-0 font-display text-[2.4rem] leading-[1.08] font-bold tracking-tight break-words lg:text-[2.75rem]";

/** The white caption card at the bottom of the stage (mockup 4): glosses in small caps, latency badge, the sentence. */
export function Captions({ line, sentence, lang }: { line: CaptionLine | undefined; sentence: SentenceState | undefined; lang: Lang }) {
  return (
    <div aria-live="polite" className="relative z-10 flex flex-col gap-1.5 rounded-2xl bg-card px-5 py-4 text-foreground">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <span className="text-sm tracking-[0.08em] text-muted-foreground [font-variant:small-caps]">
          {line ? line.de.toLowerCase().split(" ").join(" · ") : "signs appear here"}
        </span>
        {typeof sentence === "object" && (
          <span className="shrink-0 rounded-xl bg-ok-soft px-2.5 py-1 text-[13px] font-semibold text-ok-ink tabular-nums" title="Time to write the sentence">
            {(sentence.ms / 1000).toFixed(2)} s
          </span>
        )}
      </div>
      {!line ? (
        <p className="m-0 text-lg text-muted-foreground">Start the camera or play an example to see the sentence here.</p>
      ) : typeof sentence === "object" ? (
        <p key={`${line.id}-${sentence.lang}`} className={`${SENTENCE} animate-word-in`}>{sentence.text}</p>
      ) : sentence === "pending" ? (
        <p className={`${SENTENCE} text-muted-foreground`} role="status"><span className="sr-only">Writing the sentence</span><span aria-hidden="true">…</span></p>
      ) : line.final ? (
        <p className="m-0 font-display text-2xl font-bold break-words text-muted-foreground">{rawWords(line, lang)}</p>
      ) : (
        <p className="m-0 text-lg text-muted-foreground">Watching the signs…</p>
      )}
    </div>
  );
}
