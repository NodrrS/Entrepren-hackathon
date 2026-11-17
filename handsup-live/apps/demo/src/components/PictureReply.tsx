import { cn } from "@/lib/utils";
import type { Reply } from "@/lib/replies";
import { TileIcon } from "./icons";

/**
 * The staff answer as the signer reads it (mockups 3 and 5): up to three picture tiles (icon, big value, small
 * label) and one plain sentence under them; or the sentence alone as big text. `large` is the tablet's customer view.
 */
export function PictureReply({ reply, pictures, scale = 1, large = false, className }: {
  reply: Reply;
  pictures: boolean;
  scale?: number;
  large?: boolean;
  className?: string | undefined;
}) {
  const tiles = pictures ? reply.tiles : [];
  const px = (phone: number, big: number) => `${Math.round((large ? big : phone) * scale)}px`;

  if (reply.loading) {
    return (
      <div className={cn("flex flex-col gap-4", className)} role="status">
        <div className="grid grid-cols-3 gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-[18px] bg-tile" />)}
        </div>
        <p className="font-display text-2xl font-bold text-muted-foreground">Writing the answer in simple words…</p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {tiles.length > 0 && (
        // Each tile is a third of the width, as in the mockups, also when there are fewer than three.
        <ul className={cn("grid gap-3", large && "gap-5")} style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, width: `calc(${tiles.length} * (100% + ${large ? 20 : 12}px) / 3 - ${large ? 20 : 12}px)` }}>
          {tiles.map((t) => (
            <li key={`${t.icon}-${t.value}`} style={{ containerType: "inline-size" }} className={cn("flex min-w-0 flex-col items-center gap-1 overflow-hidden bg-tile px-1 py-4 text-center", large ? "rounded-[28px] py-8" : "rounded-[18px]")}>
              <TileIcon name={t.icon} className={large ? "h-16 w-16" : "h-9 w-9"} />
              {/* The value never grows wider than its tile, whatever the text size. */}
              <span className="font-display leading-none font-bold whitespace-nowrap" style={{ fontSize: `min(${px(30, 64)}, ${Math.floor(150 / Math.max(3, t.value.length))}cqw)` }}>{t.value}</span>
              <span className="text-body-2" style={{ fontSize: px(14, 22) }}>{t.label}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="m-0 font-display leading-[1.1] font-bold break-words" style={{ fontSize: tiles.length > 0 ? px(26, 52) : px(40, 72) }}>
        {reply.sentence}
      </p>
    </div>
  );
}
