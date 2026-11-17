import type { Lang } from "./recognizer";

export type IconName = "pill" | "clock" | "money" | "calendar" | "water" | "food" | "document" | "wait" | "yes" | "no" | "question" | "warning";
export interface Tile { icon: IconName; value: string; label: string }
/** A staff answer as the signer sees it: the words staff said, a very plain sentence, and up to 3 picture tiles. */
export interface Reply { said: string; sentence: string; tiles: Tile[]; loading: boolean }

// Quick replies: the counter tablet has four (mockup 4), the phone's staff half has three (mockup 2).
export const QUICK_COUNTER: Record<Lang, string[]> = {
  en: ["Prescription?", "This costs €6.50", "1 tablet, up to 3× a day", "One moment please"],
  de: ["Rezept?", "Das kostet 6,50 €", "1 Tablette, bis zu 3× täglich", "Einen Moment bitte"],
};
export const QUICK_PHONE: Record<Lang, string[]> = {
  en: ["Prescription?", "One moment", "Price"],
  de: ["Rezept?", "Einen Moment", "Preis"],
};

interface Builtin { keys: string[]; said: string; sentence: string; tiles: Tile[] }

// Answers that never need the LLM: the quick replies and the mockup's full pharmacy answer.
const BUILTIN: Record<Lang, Builtin[]> = {
  en: [
    { keys: ["prescription", "do you have a prescription"], said: "Do you have a prescription?", sentence: "Do you have a prescription?", tiles: [{ icon: "document", value: "?", label: "prescription" }] },
    { keys: ["one moment", "one moment please"], said: "One moment please.", sentence: "One moment please.", tiles: [{ icon: "wait", value: "…", label: "wait" }] },
    { keys: ["price", "this costs €6.50"], said: "This costs €6.50.", sentence: "It costs €6.50.", tiles: [{ icon: "money", value: "€6.50", label: "price" }] },
    { keys: ["1 tablet, up to 3× a day"], said: "1 tablet, up to 3× a day.", sentence: "1 tablet. Up to 3 times a day.", tiles: [{ icon: "pill", value: "1", label: "tablet" }, { icon: "clock", value: "3×", label: "max a day" }] },
    { keys: ["this one is €6.50. take one tablet up to three times a day", "this one is €6.50, take one tablet up to three times a day"], said: "This one is €6.50. Take one tablet up to three times a day.", sentence: "1 tablet. Up to 3 times a day. €6.50.", tiles: [{ icon: "pill", value: "1", label: "tablet" }, { icon: "clock", value: "3×", label: "max a day" }, { icon: "money", value: "€6.50", label: "price" }] },
  ],
  de: [
    { keys: ["rezept", "haben sie ein rezept"], said: "Haben Sie ein Rezept?", sentence: "Haben Sie ein Rezept?", tiles: [{ icon: "document", value: "?", label: "Rezept" }] },
    { keys: ["einen moment", "einen moment bitte"], said: "Einen Moment bitte.", sentence: "Einen Moment bitte.", tiles: [{ icon: "wait", value: "…", label: "warten" }] },
    { keys: ["preis", "das kostet 6,50 €"], said: "Das kostet 6,50 €.", sentence: "Das kostet 6,50 €.", tiles: [{ icon: "money", value: "6,50 €", label: "Preis" }] },
    { keys: ["1 tablette, bis zu 3× täglich"], said: "1 Tablette, bis zu 3× täglich.", sentence: "1 Tablette. Bis zu 3 Mal am Tag.", tiles: [{ icon: "pill", value: "1", label: "Tablette" }, { icon: "clock", value: "3×", label: "höchstens am Tag" }] },
    { keys: ["das kostet 6,50 €. nehmen sie eine tablette, höchstens dreimal am tag"], said: "Das kostet 6,50 €. Nehmen Sie eine Tablette, höchstens dreimal am Tag.", sentence: "1 Tablette. Höchstens 3 Mal am Tag. 6,50 €.", tiles: [{ icon: "pill", value: "1", label: "Tablette" }, { icon: "clock", value: "3×", label: "höchstens am Tag" }, { icon: "money", value: "6,50 €", label: "Preis" }] },
  ],
};

const norm = (s: string) => s.toLowerCase().replace(/["„“”]/g, "").replace(/\s+/g, " ").replace(/[.!?\s]+$/, "").trim();

/** The ready-made reply for a quick reply or the known full answer, or null. */
export function builtinReply(text: string, lang: Lang): Reply | null {
  const n = norm(text);
  const b = BUILTIN[lang].find((x) => x.keys.includes(n));
  return b ? { said: b.said, sentence: b.sentence, tiles: b.tiles, loading: false } : null;
}

/** The server's picture reply (POST /api/simplify). Throws if the LLM is unavailable. */
export async function simplify(text: string, lang: Lang, signal?: AbortSignal): Promise<{ sentence: string; tiles: Tile[] }> {
  const res = await fetch("/api/simplify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang }), ...(signal ? { signal } : {}) });
  if (!res.ok) throw new Error(`simplify failed (${res.status})`);
  return (await res.json()) as { sentence: string; tiles: Tile[] };
}

/**
 * Turns what staff said into a reply for the signer: a built-in one when it is known, else the LLM's plain
 * sentence and tiles, else the words as they are (shown as big text). Never throws.
 */
export async function makeReply(text: string, lang: Lang): Promise<Reply> {
  const said = text.trim();
  const known = builtinReply(said, lang);
  if (known) return known;
  try {
    const out = await simplify(said, lang);
    return { said, sentence: out.sentence, tiles: out.tiles, loading: false };
  } catch {
    return { said, sentence: said, tiles: [], loading: false };
  }
}
