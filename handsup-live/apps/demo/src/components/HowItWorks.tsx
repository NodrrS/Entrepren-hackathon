import { ArrowDown, ArrowRight, Hand, Languages, Sparkles, Volume2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  icon: LucideIcon;
  title: string;
  text: string;
  /** What this step produces, shown with the real example of the first demo clip. */
  example: { label: string; value: string; style: "glosses" | "sentence" | "audio" | "plain" };
  /** Which service this step needs, shown as a status dot. */
  needs?: { label: string; ok: boolean };
}

function Example({ label, value, style }: Step["example"]) {
  return (
    <div className="mt-auto rounded-xl bg-secondary px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</p>
      {style === "glosses" && <p className="mt-1 text-[13px] leading-snug tracking-[0.06em] [font-variant:small-caps] text-foreground">{value}</p>}
      {style === "plain" && <p className="mt-1 text-[13px] leading-snug">{value}</p>}
      {style === "sentence" && <p className="mt-1 font-display text-[15px] leading-snug font-bold">{value}</p>}
      {style === "audio" && (
        <div className="mt-1.5 flex h-5 items-end gap-[3px]" aria-hidden="true">
          {[40, 75, 55, 100, 65, 85, 45, 70, 35].map((h, i) => <span key={i} className="w-[3px] rounded-full bg-primary" style={{ height: `${h}%` }} />)}
        </div>
      )}
      {style === "audio" && <p className="sr-only">{value}</p>}
    </div>
  );
}

/** The four steps from camera to voice, with the real example of the first demo clip. */
export function HowItWorks({ modelOk, llmOk, voiceOk }: { modelOk: boolean; llmOk: boolean; voiceOk: boolean }) {
  const steps: Step[] = [
    {
      icon: Hand,
      title: "Gesture detection",
      text: "A machine-learning model reads your hand and body points from the camera, on your device. Your video never leaves it.",
      example: { label: "Hand and body points", value: "21 points on each hand and 33 on the body, in every video frame", style: "plain" },
      needs: { label: "Model", ok: modelOk },
    },
    {
      icon: Languages,
      title: "Sign language text",
      text: "The points become sign words, called glosses. They are in sign order, not sentence order: the meta language.",
      example: { label: "Glosses", value: "morgen · wetter · wie-aussehen · mittwoch · zehnte · november", style: "glosses" },
    },
    {
      icon: Sparkles,
      title: "Local LLM writes it out",
      text: "A language model that runs on our own machine, not a cloud AI service, rewrites the glosses as a normal sentence in the standard form.",
      example: { label: "Standard form", value: "Here is the weather for tomorrow, Wednesday the tenth of November.", style: "sentence" },
      needs: { label: "LLM", ok: llmOk },
    },
    {
      icon: Volume2,
      title: "Voice model speaks",
      text: "A speech model, also on our own machine, reads the sentence aloud, so the other person hears it without reading anything.",
      example: { label: "Audible output", value: "The sentence, spoken", style: "audio" },
      needs: { label: "Voice", ok: voiceOk },
    },
  ];

  return (
    <ol className="flex flex-col items-stretch gap-2 md:flex-row md:gap-0" aria-label="From gesture to voice, in four steps">
      {steps.map((s, i) => (
        <li key={s.title} className="contents">
          <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <s.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Step {i + 1}</p>
                <h3 className="font-display text-base leading-tight font-bold">{s.title}</h3>
              </div>
            </div>
            <p className="text-[14px] leading-snug text-muted-foreground">{s.text}</p>
            <Example {...s.example} />
            {s.needs && (
              <p className="flex items-center gap-2 text-[13px] font-medium">
                <span className={cn("h-2 w-2 rounded-full", s.needs.ok ? "bg-ok" : "bg-warn")} aria-hidden="true" />
                {s.needs.label} {s.needs.ok ? "ready" : "not ready"}
              </p>
            )}
          </div>
          {i < steps.length - 1 && (
            <span className="flex shrink-0 items-center justify-center self-center py-1 text-muted-foreground md:px-1.5 md:py-0" aria-hidden="true">
              <ArrowDown className="h-5 w-5 md:hidden" />
              <ArrowRight className="hidden h-5 w-5 md:block" />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
