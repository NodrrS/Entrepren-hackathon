import { useEffect } from "react";
import { ArrowLeft, User, Video } from "lucide-react";
import type { Reply } from "@/lib/replies";
import { PictureReply } from "./PictureReply";
import { LogoMark } from "./Logo";

/**
 * Screen 5 (mockup 5): the staff answer in picture style for the customer, full screen, with the
 * "Deaf-friendly counter" badge and a button to sign the answer back.
 */
export function CustomerView({ reply, pictures, onTogglePictures, onSign, onClose, title }: {
  reply: Reply;
  pictures: boolean;
  onTogglePictures: () => void;
  onSign: () => void;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  const large = innerWidth >= 768;
  const showPictures = pictures && reply.tiles.length > 0;

  return (
    <div role="dialog" aria-modal="true" aria-label="Answer for the customer" className="fixed inset-0 z-50 flex flex-col gap-5 overflow-y-auto bg-card px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-10 sm:py-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Back to the staff view" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-lg font-semibold text-muted-foreground sm:text-[18px]">{title}</span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-3xl bg-tile px-4 py-2 text-[15px] font-bold text-tile-ink">
          <LogoMark className="h-5 w-6 text-primary" /> Deaf-friendly counter
        </span>
      </header>

      <div className="flex-1"><PictureReply reply={reply} pictures={showPictures} large={large} /></div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onSign} className="inline-flex h-[72px] min-w-60 flex-1 items-center justify-center gap-3 rounded-full bg-primary text-2xl font-bold text-primary-foreground">
          <Video className="h-6 w-6" aria-hidden="true" /> Sign your answer
        </button>
        <button type="button" onClick={onTogglePictures} aria-pressed={!pictures} className="h-[72px] rounded-full border border-border bg-card px-7 text-xl font-semibold">
          {pictures ? "Big text only" : "Pictures + text"}
        </button>
        <button type="button" disabled className="inline-flex h-[72px] items-center justify-center gap-2 rounded-full border border-dashed border-border px-7 text-xl font-semibold text-body-2 opacity-80">
          <User className="h-5 w-5" aria-hidden="true" /> DGS (later)
        </button>
      </div>
    </div>
  );
}
