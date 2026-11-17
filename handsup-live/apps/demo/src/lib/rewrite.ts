import type { Lang } from "./recognizer";

export interface Rewritten {
  sentence: string;
  ms: number;
}

/**
 * Turns the raw sign glosses of one caption line into one natural sentence, through this page's own server
 * (POST /api/rewrite), which asks the LLM gateway. Only the recognised words and the language are sent.
 * Throws if the service is unavailable; callers fall back to the raw words.
 */
export async function rewrite(glosses: string, hints: string, lang: Lang, signal?: AbortSignal): Promise<Rewritten> {
  const res = await fetch("/api/rewrite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ glosses, ...(hints ? { hints } : {}), lang }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`rewrite failed (${res.status})`);
  const data = (await res.json()) as Partial<Rewritten>;
  if (typeof data.sentence !== "string" || !data.sentence.trim()) throw new Error("rewrite returned nothing");
  return { sentence: data.sentence.trim(), ms: typeof data.ms === "number" ? data.ms : 0 };
}
