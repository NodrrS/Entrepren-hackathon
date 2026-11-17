import type { Lang } from "./recognizer";

/** Staff speech to text through this page's own server (POST /api/transcribe → Voice Control). */
export async function transcribe(wav: Blob, lang: Lang, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`/api/transcribe?lang=${lang}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav, ...(signal ? { signal } : {}) });
  if (!res.ok) {
    let msg = "The recording could not be turned into text. Try again or type.";
    try { const d = (await res.json()) as { error?: string }; if (d.error) msg = d.error; } catch { /* default */ }
    throw new Error(msg);
  }
  return ((await res.json()) as { text?: string }).text?.trim() ?? "";
}
