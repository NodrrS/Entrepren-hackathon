import { useEffect, useRef, useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Bubble {
  key: string;
  who: "signer" | "staff";
  text: string;
}

const MAX = 400;

/** The right column of mockup 4: conversation bubbles, quick replies, a reply box and the big action button. */
export function Conversation({ bubbles, quick, onSend, mic, notice, action, className }: {
  bubbles: Bubble[];
  quick: string[];
  /** Staff answer: a quick reply or typed text. */
  onSend: (text: string) => void;
  /** The hold-to-speak button, shown while the box is empty. */
  mic?: ReactNode;
  notice?: string | null | undefined;
  action: ReactNode;
  className?: string | undefined;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [bubbles]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col gap-3.5", className)}>
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Conversation</h2>
      <div role="log" aria-live="polite" aria-label="Conversation" className="flex min-h-48 flex-1 flex-col gap-2.5 overflow-y-auto">
        {bubbles.length === 0 && <p className="text-[15px] text-muted-foreground">What is signed appears here as sentences. Your replies appear on the right.</p>}
        {bubbles.map((b) => (
          <div
            key={b.key}
            className={cn(
              "max-w-[85%] px-4 py-3 text-[17px] break-words",
              b.who === "signer"
                ? "self-start rounded-[18px_18px_18px_4px] bg-primary font-semibold text-primary-foreground"
                : "self-end rounded-[18px_18px_4px_18px] bg-accent",
            )}
          >{b.text}</div>
        ))}
        <div ref={end} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {quick.map((q) => (
          <button key={q} type="button" onClick={() => onSend(q)}
            className="min-h-12 rounded-[14px] border border-border bg-card px-2 text-[15px] font-medium hover:bg-accent">{q}</button>
        ))}
      </div>

      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="reply" className="sr-only">Type a reply</label>
        <input
          id="reply" type="text" value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} placeholder="Type a reply…" autoComplete="off"
          className="h-[52px] min-w-0 flex-1 rounded-full border border-border bg-card px-[18px] text-base placeholder:text-muted-foreground"
        />
        {text.trim() || !mic ? (
          <button type="submit" aria-label="Send reply" disabled={!text.trim()}
            className="inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">
            <Send className="h-[22px] w-[22px]" aria-hidden="true" />
          </button>
        ) : mic}
      </form>
      {notice && <p className="m-0 text-sm font-medium text-destructive" role="alert">{notice}</p>}
      {action}
    </div>
  );
}
