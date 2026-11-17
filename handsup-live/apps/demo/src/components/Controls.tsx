import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/recognizer";
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
