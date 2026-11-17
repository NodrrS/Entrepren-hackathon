import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DgsPlayer, type DgsData, type Step, type View } from "@/lib/pharmacy/dgs";

/**
 * The staff answer in DGS: real SignDict sign videos next to a skeleton person (MediaPipe pose + hands,
 * precomputed), in sync, with a Video / Skeleton / Both view. Signs without an openly licensed video are a
 * text card ("Gebärde folgt"), never faked. `playKey` restarts playback for the same steps.
 */
export function DgsReply({ data, steps, playKey, className }: { data: DgsData; steps: Step[]; playKey: number; className?: string | undefined }) {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const cardWord = useRef<HTMLParagraphElement>(null);
  const gloss = useRef<HTMLParagraphElement>(null);
  const word = useRef<HTMLParagraphElement>(null);
  const player = useRef<DgsPlayer | null>(null);
  const [view, setView] = useState<View>("both");
  const [now, setNow] = useState(-1);

  useEffect(() => {
    if (!root.current || !video.current || !canvas.current || !card.current || !cardWord.current || !gloss.current || !word.current) return;
    player.current = new DgsPlayer({ root: root.current, video: video.current, canvas: canvas.current, card: card.current, cardWord: cardWord.current, gloss: gloss.current, word: word.current }, data);
    return () => player.current?.stop();
  }, [data]);

  useEffect(() => {
    if (!player.current || !steps.length) return;
    void player.current.play(steps, (i) => setNow(i)).then(() => setNow(-1));
    return () => player.current?.stop();
  }, [steps, playKey]);

  useEffect(() => player.current?.setView(view), [view]);

  return (
    <section aria-label="Antwort in DGS" className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Antwort in DGS</span>
        <div className="flex-1" />
        {(["video", "skeleton", "both"] as View[]).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
            className={cn("h-9 rounded-full px-3 font-semibold", view === v ? "bg-foreground text-background" : "bg-secondary text-muted-foreground")}>
            {v === "video" ? "Video" : v === "skeleton" ? "Skelett" : "Beides"}
          </button>
        ))}
      </div>
      <div ref={root} data-view="both" data-card="false" className="dgs-player relative grid grid-cols-2 gap-2 data-[view=skeleton]:grid-cols-1 data-[view=video]:grid-cols-1">
        <div className="dgs-pv relative aspect-[5/4] overflow-hidden rounded-xl bg-black">
          <video ref={video} muted playsInline className="h-full w-full object-contain" />
          <span className="absolute top-1.5 left-2 rounded-full bg-black/50 px-2 text-xs text-white/70">Video</span>
        </div>
        <div className="dgs-ps relative aspect-[5/4] overflow-hidden rounded-xl bg-stage">
          <canvas ref={canvas} className="h-full w-full object-contain" />
          <span className="absolute top-1.5 left-2 rounded-full bg-black/50 px-2 text-xs text-white/70">Skelett</span>
        </div>
        <div ref={card} className="dgs-card absolute inset-0 hidden flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card text-center">
          <p ref={cardWord} className="m-0 font-display text-4xl font-bold" />
          <p className="m-0 mt-1 font-semibold text-destructive">Gebärde folgt</p>
        </div>
      </div>
      <div className="rounded-[14px] bg-secondary px-4 py-2">
        <p ref={gloss} className="m-0 font-display text-xl font-bold" />
        <p ref={word} className="m-0 text-[15px] text-muted-foreground" />
      </div>
      {steps.length > 0 && (
        <p className="m-0 flex flex-wrap gap-1.5">
          {steps.map((s, i) => (
            <span key={`${s.gloss}-${i}`} className={cn("rounded-full px-2.5 py-0.5 text-sm", i === now ? "bg-primary text-primary-foreground" : s.available ? "border border-primary" : "bg-secondary text-muted-foreground")}>
              {s.available ? s.gloss : `${s.de} (Text)`}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
