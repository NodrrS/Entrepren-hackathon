import { Settings, Video } from "lucide-react";
import type { Session } from "@/lib/useSession";
import { Logo } from "../Logo";
import { SOURCE_NOTES, SourceToggle } from "../Controls";
import { cn } from "@/lib/utils";

const STEPS = ["Front camera faces you", "Sign. Words appear for the staff", "Read the answer, your way"];

/** The phone standing on a counter (mockup 1): an orange dashed line across the screen, waves on both sides. */
function Illustration() {
  return (
    <svg viewBox="0 0 400 200" className="h-full w-full" role="img" aria-label="A phone standing on the counter">
      <path d="M92 70 C 100 50, 128 44, 150 62" fill="none" stroke="#FF5A36" strokeWidth="5" strokeLinecap="round" />
      <path d="M308 70 C 300 50, 272 44, 250 62" fill="none" stroke="#FF5A36" strokeWidth="5" strokeLinecap="round" />
      <rect x="160" y="16" width="80" height="128" rx="16" fill="#fff" stroke="#141414" strokeWidth="5" />
      <circle cx="200" cy="34" r="5" fill="#141414" />
      <path d="M172 80 H 228" stroke="#FF5A36" strokeWidth="4" strokeDasharray="7 6" />
      <path d="M176 144 L 168 164 M224 144 L 232 164" stroke="#141414" strokeWidth="5" strokeLinecap="round" />
      <rect x="84" y="162" width="232" height="14" rx="7" fill="#141414" />
    </svg>
  );
}

/** Screen 1 of the signer flow: how to stand the phone, reply style, language, Start. */
const START: Record<Session["source"], string> = { camera: "Start camera", weather: "Play the forecast", pharmacy: "Start camera (Apotheke)" };

export function Setup({ s, onStart, onSettings, starting }: { s: Session; onStart: () => void; onSettings: () => void; starting: boolean }) {
  const loading = !s.ready;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-3 px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between">
        <Logo className="h-8 w-auto" />
        <button type="button" onClick={onSettings} aria-label="Settings" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card">
          <Settings className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <div className="h-[clamp(80px,14dvh,200px)] shrink-0 rounded-3xl bg-tile p-2"><Illustration /></div>

      <div className="space-y-2">
        <h1 className="font-display text-[clamp(26px,3.6dvh,32px)] leading-[1.1] font-bold">Stand your phone on the counter</h1>
        <p className="text-[17px] leading-snug text-body-2">The staff don&apos;t need an app. They read the top half and speak their answer.</p>
      </div>

      <ol className="space-y-2">
        {STEPS.map((t, i) => (
          <li key={t} className="flex items-center gap-4">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground font-bold text-background" aria-hidden="true">{i + 1}</span>
            <span className="text-[17px]">{t}</span>
          </li>
        ))}
      </ol>

      <div className="flex gap-2">
        <button type="button" onClick={() => s.setPictures(!s.pictures)} aria-label={`Reply style: ${s.pictures ? "pictures and big text" : "big text only"}. Press to change.`}
          className="min-h-11 flex-1 rounded-full border border-border bg-card px-3 text-[13px] font-medium whitespace-nowrap">
          Reply: {s.pictures ? "pictures + text" : "big text"}
        </button>
        <button type="button" onClick={() => s.setLang(s.lang === "en" ? "de" : "en")} aria-label={`Language: DGS to ${s.lang === "en" ? "English" : "German"}. Press to change.`}
          className="min-h-11 flex-1 rounded-full border border-border bg-card px-3 text-[13px] font-medium whitespace-nowrap">
          DGS → {s.lang === "en" ? "English" : "Deutsch"}
        </button>
      </div>

      <div className="flex-1" />

      <SourceToggle value={s.source} onChange={s.setSource} />
      <p className="m-0 -mt-1 text-center text-[13px] text-muted-foreground">
        {SOURCE_NOTES[s.source]}
      </p>
      {!s.useMock && !loading && s.real.statusKind !== "ok" && s.real.statusKind !== "info" && <p className="m-0 text-center text-sm text-destructive">{s.real.statusText}</p>}
      <button type="button" onClick={onStart} disabled={loading || starting}
        className={cn("inline-flex h-16 w-full items-center justify-center gap-3 rounded-full bg-primary text-[22px] font-bold text-primary-foreground disabled:opacity-60")}>
        <Video className="h-6 w-6" aria-hidden="true" />
        {loading ? `Loading the model… ${Math.round(s.real.progress * 100)}%` : START[s.source]}
      </button>
      <p className="m-0 text-center text-[13px] text-muted-foreground">Nothing is recorded or uploaded.</p>
    </main>
  );
}
