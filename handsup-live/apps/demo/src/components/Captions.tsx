import type { CaptionLine } from "@/lib/recognizer";

function Words({ text, sep, className }: { text: string; sep: string; className: string }) {
  const words = text.split(sep).filter(Boolean);
  return (
    <p className={className}>
      {words.map((w, i) => (
        <span key={`${i}-${w}`} className="inline-block animate-word-in">{w.trim()}{i < words.length - 1 ? (sep === " " ? " " : " · ") : ""}</span>
      ))}
    </p>
  );
}

export function Captions({ lines }: { lines: CaptionLine[] }) {
  const newest = lines.at(-1);
  const older = lines.slice(0, -1).slice(-4);
  return (
    <div aria-live="polite" className="min-h-[9.5rem] rounded-2xl border border-border bg-muted p-4 sm:p-5">
      {!newest ? (
        <p className="text-sm text-muted-foreground">Captions will appear here.</p>
      ) : (
        <>
          <ul className="mb-3 max-h-20 space-y-1 overflow-y-auto text-sm text-muted-foreground/70">
            {older.map((l) => <li key={l.id} className="truncate uppercase tracking-wide">{l.de} <span className="normal-case tracking-normal">— {l.en}</span></li>)}
          </ul>
          <Words key={`de-${newest.id}`} text={newest.de} sep=" " className="text-xl font-bold uppercase tracking-wider break-words sm:text-2xl" />
          <Words key={`en-${newest.id}`} text={newest.en} sep="·" className="mt-1 text-base text-muted-foreground break-words" />
        </>
      )}
    </div>
  );
}
