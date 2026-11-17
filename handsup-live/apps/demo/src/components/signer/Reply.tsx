import { useState } from "react";
import { Send, User } from "lucide-react";
import type { Session } from "@/lib/useSession";
import { HoldToSpeak } from "../HoldToSpeak";
import { PictureReply } from "../PictureReply";

const SCALES = [1, 1.25, 1.5];

/** Screen 3 of the signer flow (mockup 3): the staff answer for the signer, and what was said for the staff. */
export function Reply({ s, onSign, onReplace }: { s: Session; onSign: () => void; onReplace: (text: string) => void }) {
  const reply = s.reply;
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  if (!reply) return null;
  const pictures = s.pictures && reply.tiles.length > 0;

  const send = (t: string) => {
    const said = t.trim();
    if (!said) return;
    setProblem(null); setTyping(false); setText("");
    onReplace(said);
  };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden">
      {/* What staff said: rotated for them */}
      <section className="flex h-[30%] shrink-0 rotate-180 flex-col gap-2 bg-panel px-5 pt-4 pb-[max(1rem,env(safe-area-inset-top))]" aria-label="For staff">
        <span className="text-[13px] font-semibold text-muted-foreground">You said · shown to customer</span>
        <p className="m-0 min-h-0 flex-1 overflow-y-auto text-xl leading-snug font-medium">“{reply.said}”</p>
        {problem && <p className="m-0 text-sm font-medium text-destructive" role="alert">{problem}</p>}
        {typing ? (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <label htmlFor="retype" className="sr-only">Type your answer</label>
            <input id="retype" autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder="Type your answer…" autoComplete="off"
              className="h-12 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-base" />
            <button type="submit" disabled={!text.trim()} aria-label="Send answer" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">
              <Send className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <div className="flex gap-2">
            <HoldToSpeak lang={s.lang} onText={send} onProblem={setProblem} className="h-12 flex-1 text-base">Speak again</HoldToSpeak>
            <button type="button" onClick={() => setTyping(true)} className="min-h-12 rounded-full border border-border bg-card px-5 text-base font-semibold">Type</button>
          </div>
        )}
      </section>

      <div className="h-0.5 shrink-0 bg-primary" />

      {/* What the signer reads */}
      <section className="flex min-h-0 flex-1 flex-col gap-3 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" aria-label="The answer">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-muted-foreground">{s.useMock ? "Pharmacy says" : "Staff says"}</span>
          <button type="button" onClick={() => s.setPictures(!s.pictures)} aria-label="Change how the answer looks"
            className="min-h-11 rounded-[14px] bg-tile px-3 text-[13px] font-semibold text-tile-ink">
            {s.pictures ? "Pictures + simple text" : "Big text"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto" aria-live="polite">
          <PictureReply reply={reply} pictures={pictures} scale={SCALES[step]!} />
        </div>
        <button type="button" disabled className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-dashed border-border text-[15px] font-semibold text-body-2 opacity-80">
          <User className="h-4 w-4" aria-hidden="true" /> Show in DGS (coming later)
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={onSign} className="h-[60px] flex-1 rounded-full bg-primary text-[19px] font-bold text-primary-foreground">Sign answer</button>
          <button type="button" onClick={() => setStep((step + 1) % SCALES.length)} className="h-[60px] rounded-full border border-border bg-card px-6 text-base font-semibold">Bigger</button>
        </div>
      </section>
    </div>
  );
}
