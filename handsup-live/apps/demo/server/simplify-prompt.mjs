// Prompt for the picture reply: what the staff member said, turned into a very short plain sentence plus up to three
// "tiles" (an icon, a big value and a small label) for a Deaf reader who may read written language only at primary
// school level. The model answers in JSON; parseSimplify() checks every field, so nothing odd reaches the page.

export const ICONS = ["pill", "clock", "money", "calendar", "water", "food", "document", "wait", "yes", "no", "question", "warning"];

const SYSTEM = {
  en: [
    "You rewrite what a pharmacy or office staff member said for a Deaf customer who reads simple language best.",
    "Reply with JSON only, in this shape: {\"sentence\": string, \"tiles\": [{\"icon\": string, \"value\": string, \"label\": string}]}.",
    "sentence: the answer in very short, plain sentences (present tense, no difficult words), at most 90 characters per sentence, same meaning, nothing added.",
    `tiles: 0 to 3 picture tiles for the key facts only (an amount, how often, a price, a time, yes or no, wait). icon must be one of: ${ICONS.join(", ")}.`,
    "value: at most 6 characters (a number, a price like €6.50, or 3×). label: one or two plain words, lower case.",
    "Use no tiles (an empty list) when the answer has no clear fact to show. Never invent numbers, prices or doses that are not in the text.",
  ].join(" "),
  de: [
    "Du schreibst um, was ein Mitarbeiter einer Apotheke oder eines Amts zu einem gehörlosen Kunden gesagt hat, der einfache Sprache am besten liest.",
    "Antworte nur mit JSON in dieser Form: {\"sentence\": string, \"tiles\": [{\"icon\": string, \"value\": string, \"label\": string}]}.",
    "sentence: die Antwort in sehr kurzen, einfachen Sätzen (Gegenwart, keine schweren Wörter), höchstens 90 Zeichen pro Satz, gleiche Bedeutung, nichts hinzufügen.",
    `tiles: 0 bis 3 Bildkacheln nur für die wichtigsten Fakten (Menge, wie oft, Preis, Zeit, ja oder nein, warten). icon muss eines sein von: ${ICONS.join(", ")}.`,
    "value: höchstens 6 Zeichen (eine Zahl, ein Preis wie 6,50 €, oder 3×). label: ein oder zwei einfache Wörter, klein geschrieben.",
    "Keine Kacheln (leere Liste), wenn es keinen klaren Fakt gibt. Erfinde nie Zahlen, Preise oder Dosen, die nicht im Text stehen.",
  ].join(" "),
};

// [input, answer]
const EXAMPLES = {
  en: [
    ["This one is €6.50. Take one tablet up to three times a day.", { sentence: "1 tablet. Up to 3 times a day. €6.50.", tiles: [{ icon: "pill", value: "1", label: "tablet" }, { icon: "clock", value: "3×", label: "max a day" }, { icon: "money", value: "€6.50", label: "price" }] }],
    ["Please wait a moment, I will ask my colleague.", { sentence: "Please wait. I ask my colleague.", tiles: [{ icon: "wait", value: "…", label: "wait" }] }],
    ["Yes, that works without a prescription.", { sentence: "Yes. You do not need a prescription.", tiles: [{ icon: "yes", value: "yes", label: "no prescription" }] }],
    ["Come back on Thursday at ten.", { sentence: "Come back on Thursday at 10.", tiles: [{ icon: "calendar", value: "Thu", label: "day" }, { icon: "clock", value: "10:00", label: "time" }] }],
    ["Thank you, goodbye.", { sentence: "Thank you. Goodbye.", tiles: [] }],
  ],
  de: [
    ["Das kostet 6,50 €. Nehmen Sie eine Tablette, höchstens dreimal am Tag.", { sentence: "1 Tablette. Höchstens 3 Mal am Tag. 6,50 €.", tiles: [{ icon: "pill", value: "1", label: "Tablette" }, { icon: "clock", value: "3×", label: "höchstens am Tag" }, { icon: "money", value: "6,50 €", label: "Preis" }] }],
    ["Bitte warten Sie einen Moment, ich frage meine Kollegin.", { sentence: "Bitte warten. Ich frage meine Kollegin.", tiles: [{ icon: "wait", value: "…", label: "warten" }] }],
    ["Ja, das geht ohne Rezept.", { sentence: "Ja. Sie brauchen kein Rezept.", tiles: [{ icon: "yes", value: "ja", label: "ohne Rezept" }] }],
    ["Kommen Sie am Donnerstag um zehn Uhr wieder.", { sentence: "Kommen Sie am Donnerstag um 10 Uhr wieder.", tiles: [{ icon: "calendar", value: "Do", label: "Tag" }, { icon: "clock", value: "10:00", label: "Uhr" }] }],
    ["Vielen Dank, auf Wiedersehen.", { sentence: "Danke. Auf Wiedersehen.", tiles: [] }],
  ],
};

export function buildSimplifyMessages(text, lang) {
  const shots = EXAMPLES[lang].flatMap(([q, a]) => [{ role: "user", content: q }, { role: "assistant", content: JSON.stringify(a) }]);
  return [{ role: "system", content: SYSTEM[lang] }, ...shots, { role: "user", content: text }];
}

const tidy = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const clip = (v, n) => tidy(v).slice(0, n);

/**
 * Checks the model's answer. Returns { sentence, tiles } with valid tiles only (known icon, short value, short
 * label, at most three), or null when there is no usable sentence.
 */
export function parseSimplify(raw) {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const sentence = clip(obj?.sentence, 280);
  if (!sentence) return null;
  const tiles = [];
  for (const t of Array.isArray(obj.tiles) ? obj.tiles : []) {
    const icon = typeof t?.icon === "string" ? t.icon.toLowerCase().trim() : "";
    const value = tidy(t?.value);
    const label = clip(t?.label, 24);
    // A value that is too long is dropped, never cut in the middle of a word.
    if (ICONS.includes(icon) && value && value.length <= 8 && label) tiles.push({ icon, value, label });
    if (tiles.length === 3) break;
  }
  return { sentence, tiles };
}
