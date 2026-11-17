import type { CaptionLine, Lang } from "@/lib/recognizer";
import { cn } from "@/lib/utils";

/** A finished line's rewrite: waiting for the LLM, failed (raw words are shown), or the sentence and how long it took. */
export type SentenceState = "pending" | "failed" | { text: string; ms: number; lang: Lang };

function Glosses({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ").filter(Boolean);
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Recognised signs">
      {words.map((w, i) => (
        <li key={`${i}-${w}`} className="animate-word-in rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {w}
        </li>
      ))}
    </ul>
  );
}

function Latency({ ms }: { ms: number }) {
  return (
    <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-primary px-3 text-xs font-semibold tabular-nums text-primary-foreground" title="Time to write the sentence">
      {(ms / 1000).toFixed(2)} s
    </span>
  );
}

export function Captions({ lines, sentences, lang }: { lines: CaptionLine[]; sentences: Record<number, SentenceState>; lang: Lang }) {
  const newest = lines.at(-1);
  const older = lines.slice(0, -1).slice(-4).reverse();
  const cur = newest ? sentences[newest.id] : undefined;
  const fallback = newest ? (lang === "en" ? newest.en : newest.de.replace(/-/g, " ")) : "";

  return (
    <div aria-live="polite" className="min-h-[11rem] rounded-2xl border border-border bg-muted p-4 sm:p-6">
      {!newest ? (
        <p className="text-sm text-muted-foreground">Captions will appear here.</p>
      ) : (
        <>
          <Glosses key={`g-${newest.id}-${newest.de.length}`} text={newest.de} />
          <div className="mt-3 flex items-start justify-between gap-3">
            {typeof cur === "object" ? (
              <>
                <p key={`s-${newest.id}-${cur.lang}`} className="animate-word-in text-[2.4rem] leading-[1.1] font-bold tracking-tight break-words lg:text-[2.75rem]">{cur.text}</p>
                <Latency ms={cur.ms} />
              </>
            ) : cur === "pending" ? (
              <p className="text-[2.4rem] leading-[1.1] font-bold text-muted-foreground lg:text-[2.75rem]" role="status"><span className="sr-only">Writing the sentence</span><span aria-hidden="true">…</span></p>
            ) : newest.final ? (
              <p className="text-xl font-semibold text-muted-foreground break-words sm:text-2xl">{fallback}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Listening…</p>
            )}
          </div>
          {older.length > 0 && (
            <ul className="mt-5 max-h-44 space-y-3 overflow-y-auto border-t border-border pt-4">
              {older.map((l) => {
                const s = sentences[l.id];
                return (
                  <li key={l.id}>
                    <p className="text-lg font-semibold break-words">{typeof s === "object" ? s.text : lang === "en" ? l.en : l.de.replace(/-/g, " ")}</p>
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground/80">{l.de}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
