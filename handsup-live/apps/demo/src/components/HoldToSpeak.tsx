import { useRef, useState, type ReactNode } from "react";
import { Loader2, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/recognizer";
import { startRecording, type Recording } from "@/lib/recordWav";
import { transcribe } from "@/lib/transcribe";
import { timed } from "@/lib/metrics";

const MAX_SECONDS = 20;

function micProblem(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (!navigator.mediaDevices?.getUserMedia) return "The microphone needs a secure (https) page. Type your answer instead.";
  if (name === "NotAllowedError" || name === "SecurityError") return "The microphone is blocked. Allow it in the browser, or type your answer.";
  if (name === "NotFoundError") return "No microphone was found. Type your answer instead.";
  return "The microphone could not be started. Type your answer instead.";
}

/**
 * Press and hold to record the staff answer, release to send: the recording is turned into text by the voice
 * service (through our own server) and handed to `onText`. Also works with the space and enter keys.
 * `variant` is the look: a wide button, or a round icon button.
 */
export function HoldToSpeak({ lang, onText, onProblem, variant = "wide", className, children }: {
  lang: Lang;
  onText: (text: string) => void;
  onProblem: (message: string) => void;
  variant?: "wide" | "round";
  className?: string | undefined;
  children?: ReactNode;
}) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const rec = useRef<Recording | null>(null);
  const held = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const end = async () => {
    held.current = false;
    clearTimeout(timer.current);
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    const { wav, seconds } = await r.stop();
    if (seconds < 0.5) { setState("idle"); onProblem("Hold the button while you speak."); return; }
    setState("working");
    try {
      const text = await timed("transcribe", transcribe(wav, lang));
      if (text) onText(text);
      else onProblem("Nothing was heard. Try again, or type your answer.");
    } catch (e) {
      onProblem((e as Error).message);
    } finally {
      setState("idle");
    }
  };

  const begin = async () => {
    if (state !== "idle" || held.current) return;
    held.current = true;
    try {
      const r = await startRecording();
      if (!held.current) { r.cancel(); onProblem("Hold the button while you speak."); return; } // released before the microphone opened
      rec.current = r;
      setState("recording");
      timer.current = window.setTimeout(() => void end(), MAX_SECONDS * 1000);
    } catch (e) {
      held.current = false;
      setState("idle");
      onProblem(micProblem(e));
    }
  };

  const label = state === "recording" ? "Listening… let go to send" : state === "working" ? "Writing it down…" : children;
  const Icon = state === "working" ? Loader2 : Mic;
  return (
    <button
      type="button"
      aria-label={variant === "round" ? "Hold to speak your answer" : undefined}
      aria-pressed={state === "recording"}
      disabled={state === "working"}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); void begin(); }}
      onPointerUp={() => void end()}
      onPointerCancel={() => void end()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); void begin(); } }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); void end(); } }}
      className={cn(
        "inline-flex touch-none items-center justify-center gap-2.5 font-semibold select-none [-webkit-touch-callout:none]",
        variant === "round" ? "h-[52px] w-[52px] shrink-0 rounded-full" : "w-full rounded-full",
        state === "recording" ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
        className,
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", state === "working" && "animate-spin")} aria-hidden="true" />
      {variant === "wide" && <span>{label}</span>}
    </button>
  );
}
