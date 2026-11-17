import { useCallback, useEffect, useRef, useState } from "react";
import { speak, type VoiceStyle } from "@/lib/speech";
import type { Lang } from "@/lib/recognizer";

/** Speaks texts one at a time, in order. */
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
        const blob = await speak(item.text, item.lang, item.voice);
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
