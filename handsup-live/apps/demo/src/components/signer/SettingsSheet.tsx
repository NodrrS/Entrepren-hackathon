import { HowItWorks } from "../HowItWorks";
import { LangToggle, SourceToggle, Switch } from "../Controls";
import type { Session } from "@/lib/useSession";

/** Settings on the signer's phone: live camera or scripted example, speech, skeleton, language, how it works, and the counter view. */
export function SettingsSheet({ s, onClose, onCounter }: { s: Session; onClose: () => void; onCounter: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-[430px] space-y-5 overflow-y-auto rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Settings</h2>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background">Done</button>
        </div>

        <div className="space-y-1">
          <SourceToggle useMock={s.useMock} onChange={s.setUseMock} />
          <p className="m-0 text-sm text-muted-foreground">
            {s.useMock ? "Plays a short pharmacy conversation. Turn it off to use the camera and the real sign model (it only knows German weather-forecast signs)." : "Using the camera and the real sign model. It only knows German weather-forecast signs, so everyday signing mostly gives wrong or no words."}
          </p>
        </div>
        <div className="space-y-1">
          <p className="m-0 text-sm font-semibold text-muted-foreground">Language</p>
          <LangToggle value={s.lang} onChange={s.setLang} label="Language" />
        </div>
        <div className="flex flex-wrap gap-x-4">
          <Switch checked={s.speakOn} onChange={s.setSpeakOn} label="Say sentences aloud" />
          {!s.useMock && <Switch checked={s.real.showSkeleton} onChange={s.real.setShowSkeleton} label="Show skeleton" />}
        </div>

        <details className="rounded-2xl bg-secondary p-4">
          <summary className="min-h-11 cursor-pointer text-[15px] font-semibold">How it works</summary>
          <div className="pt-3"><HowItWorks modelOk={s.ready} llmOk={s.llmOk} voiceOk={s.voiceOk} /></div>
          <p className="m-0 pt-3 text-sm">Your video never leaves your phone. Staff speech is sent to our own server to be written down, and is not stored. Research demo: the sign model was trained on German Sign Language weather forecasts and is not for medical, legal or emergency use.</p>
        </details>

        <button type="button" onClick={onCounter} className="min-h-12 w-full rounded-[14px] border border-border text-[15px] font-medium">Open the counter (tablet) view</button>
      </div>
    </div>
  );
}
