import { useState } from "react";
import type { Session } from "@/lib/useSession";
import { Reply } from "./Reply";
import { SettingsSheet } from "./SettingsSheet";
import { Setup } from "./Setup";
import { Signing } from "./Signing";

type Screen = "setup" | "signing" | "reply";

/** The signer's phone flow: set up → sign (staff read the top half) → reply (staff answer in pictures) → sign again. */
export function SignerApp({ s, onCounter }: { s: Session; onCounter: () => void }) {
  const [screen, setScreen] = useState<Screen>("setup");
  const [sheet, setSheet] = useState(false);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    try { await s.start(); setScreen("signing"); } finally { setStarting(false); }
  };
  // The staff answer replaces nothing on the signing screen: it opens the reply screen. The scripted dialogue
  // goes on only once the signer is back to signing.
  const reply = (text: string) => { s.sendReply(text, { advance: false }); setScreen("reply"); };
  const signAgain = () => { setScreen("signing"); if (s.useMock) s.mock.next(); };
  const end = () => { s.stop(); s.reset(); setScreen("setup"); };

  return (
    <>
      {screen === "setup" && <Setup s={s} onStart={() => void start()} onSettings={() => setSheet(true)} starting={starting} />}
      <Signing s={s} active={screen === "signing"} onReply={reply} onEnd={end} />
      {screen === "reply" && <Reply s={s} onSign={signAgain} onReplace={(t) => s.sendReply(t, { advance: false })} onHome={end} />}
      {sheet && <SettingsSheet s={s} onClose={() => setSheet(false)} onCounter={onCounter} />}
    </>
  );
}
