import type { Lang } from "./recognizer";

/**
 * Text to speech through this page's own server (POST /api/tts), which asks the Voice Control service.
 * Only the text and the language ("en" | "de") are sent; the server picks the voice. Returns audio/wav.
 */
export async function speak(text: string, lang: Lang, signal?: AbortSignal): Promise<Blob | null> {
  const clean = text.trim();
  if (!clean) return null;
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: clean, lang }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`speech failed (${res.status})`);
  return res.blob();
}

/** Is the voice service reachable from the server? */
export async function checkVoice(): Promise<boolean> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return false;
    return ((await res.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}
