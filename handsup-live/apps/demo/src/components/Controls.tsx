import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/recognizer";
import type { VoiceStyle } from "@/lib/speech";
import type { ButtonHTMLAttributes } from "react";

/** "ghost" is the mockup's outlined 48 px button (14 px radius); "primary" is the orange pill. */
export function Pill({ variant = "ghost", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      type="button"
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-2 text-[15px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary"
          ? "min-h-12 rounded-full bg-primary px-6 font-bold text-primary-foreground hover:bg-primary/90"
          : "min-h-12 rounded-[14px] border border-border bg-card px-4 text-foreground hover:bg-accent aria-pressed:border-foreground aria-pressed:bg-accent",
        className,
      )}
    />
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-[15px] text-muted-foreground">
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-12 w-14 items-center justify-center"
      >
        <span className={cn("absolute top-1/2 left-1/2 h-6 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border transition-colors", checked ? "border-primary bg-primary" : "bg-secondary")} />
        <span className={cn("absolute top-1/2 left-[calc(50%-18px)] h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-foreground transition-transform", checked && "translate-x-4")} />
      </button>
      <span aria-hidden="true">{label}</span>
    </label>
  );
}

export function LangToggle({ value, onChange, label }: { value: Lang; onChange: (l: Lang) => void; label: string }) {
  const opts: Array<[Lang, string]> = [["en", "English"], ["de", "Deutsch"]];
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-border bg-secondary p-1">
      {opts.map(([v, t]) => (
        <button
          key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("h-10 min-w-11 rounded-full px-4 text-[15px] font-medium transition-colors", value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >{t}</button>
      ))}
    </div>
  );
}

export function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[14px] bg-secondary px-3 py-1.5 text-sm font-semibold">
      <span className={cn("h-2 w-2 rounded-full", ok ? "bg-ok" : "bg-warn")} aria-hidden="true" />
      {children}
    </span>
  );
}

export function Equalizer({ active }: { active: boolean }) {
  return (
    <span className="inline-flex h-5 items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-full bg-primary", active ? "h-5 animate-eq" : "h-1.5")} style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

export type SourceChoice = "camera" | "weather" | "pharmacy";
export const SOURCE_LABELS: Record<SourceChoice, string> = { camera: "Live camera", weather: "Weather", pharmacy: "Pharmacy" };
export const SOURCE_NOTES: Record<SourceChoice, string> = {
  camera: "Front camera · German weather-forecast signs",
  weather: "A recorded weather forecast, read by the real model",
  pharmacy: "A scripted pharmacy conversation, no camera",
};

/** What to translate: the live camera, the recorded weather forecast (real model), or the scripted pharmacy example. */
export function SourceToggle({ value, onChange, className }: { value: SourceChoice; onChange: (v: SourceChoice) => void; className?: string | undefined }) {
  return (
    <div role="radiogroup" aria-label="What to translate" className={cn("grid grid-cols-3 rounded-full border border-border bg-secondary p-1", className)}>
      {(Object.keys(SOURCE_LABELS) as SourceChoice[]).map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("h-11 rounded-full px-2 text-[14px] font-semibold whitespace-nowrap transition-colors", value === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
          {SOURCE_LABELS[v]}
        </button>
      ))}
    </div>
  );
}

/** Which voice speaks: the default (main) voice, or one of two character voices. */
export function VoiceToggle({ value, onChange, className }: { value: VoiceStyle; onChange: (v: VoiceStyle) => void; className?: string | undefined }) {
  const opts: Array<[VoiceStyle, string]> = [["default", "Default"], ["c3po", "C-3PO"], ["snape", "Snape"]];
  return (
    <div role="radiogroup" aria-label="Voice" className={cn("inline-flex rounded-full border border-border bg-secondary p-1", className)}>
      {opts.map(([v, t]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("h-10 min-w-11 rounded-full px-4 text-[15px] font-medium transition-colors", value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {t}
        </button>
      ))}
    </div>
  );
}
