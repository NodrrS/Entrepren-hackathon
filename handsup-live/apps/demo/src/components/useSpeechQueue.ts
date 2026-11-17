import { useCallback, useEffect, useRef, useState } from "react";
import { speak, type VoiceStyle } from "@/lib/speech";
import { timed } from "@/lib/metrics";
import type { Lang } from "@/lib/recognizer";

/** Fallback voice: the browser's speechSynthesis (on the device; no server needed). */
function browserSpeak(text: string, lang: Lang, muted: boolean): Promise<void> {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth || muted) return Promise.resolve();
  return new Promise<void>((res) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "de" ? "de-DE" : "en-US";
    u.onend = u.onerror = () => res();
    synth.speak(u);
    setTimeout(res, 15_000); // never block the queue
  });
}

/** Speaks texts one at a time, in order (the voice server, else the browser's voice). */
export function useSpeechQueue(muted: boolean) {
  const queue = useRef<Array<{ text: string; lang: Lang; voice: VoiceStyle }>>([]);
  const busy = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  useEffect(() => { if (audio.current) audio.current.muted = muted; }, [muted]);

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length) {
      const item = queue.current.shift()!;
      setPlaying(true);
      try {
        let blob: Blob | null = null;
        try {
          blob = await timed("speech", speak(item.text, item.lang, item.voice));
        } catch {
          blob = null; // no voice server (static site): the browser's own voice below
        }
        if (!blob) await browserSpeak(item.text, item.lang, mutedRef.current);
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = (audio.current ??= new Audio());
          a.muted = mutedRef.current;
          a.src = url;
          await new Promise<void>((res) => { a.onended = a.onerror = () => res(); a.play().catch(() => res()); });
          URL.revokeObjectURL(url);
        }
      } catch { /* skip line */ }
    }
    setPlaying(false);
    busy.current = false;
  }, []);

  const enqueue = useCallback((text: string, lang: Lang, voice: VoiceStyle = "default") => {
    if (!text.trim()) return;
    queue.current.push({ text, lang, voice });
    void pump();
  }, [pump]);

  return { enqueue, playing };
}
