import { useEffect, useRef, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { speak } from "@/lib/speech";
import type { Lang } from "@/lib/recognizer";
import { Card, LangToggle, Pill } from "./Controls";

const MAX = 400;

export function TextCard({ className }: { className?: string | undefined }) {
  const [text, setText] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const go = async () => {
    abort.current?.abort();
    const ac = (abort.current = new AbortController());
    setBusy(true); setMsg(null);
    try {
      const blob = await speak(text.trim(), lang, ac.signal);
      if (blob) setUrl(URL.createObjectURL(blob));
      else setMsg("No audio came back for this text.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("Speech could not be generated. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <Card title="Text → Speech" className={className}>
      <label htmlFor="tts" className="sr-only">Text to speak</label>
      <textarea
        id="tts" value={text} maxLength={MAX} rows={6} onChange={(e) => setText(e.target.value)}
        placeholder="Type something to hear it spoken…"
        className="w-full resize-none rounded-2xl border border-input bg-muted p-4 text-base placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary"
      />
      <p className="mt-1 text-right text-xs text-muted-foreground" aria-live="polite">{text.length} / {MAX}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <LangToggle value={lang} onChange={setLang} label="Speech language" />
        <Pill variant="primary" onClick={go} disabled={busy || !text.trim()} aria-busy={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
          {busy ? "Speaking…" : "Speak"}
        </Pill>
      </div>
      {url && <audio controls src={url} className="mt-4 w-full" />}
      <p role="status" className="mt-3 min-h-5 text-sm text-destructive">{msg}</p>
    </Card>
  );
}
