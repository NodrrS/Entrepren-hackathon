// Prompt for the gloss -> natural sentence step. The sign model outputs German Sign Language (DGS) glosses:
// one capitalised word per sign, in sign order (not German word order), with markers like IX (pointing),
// loc-NORD (a place in the signing space) and -PLUSPLUS (repeated or emphasised sign).
// The model was trained on weather forecasts, so the examples are weather lines.

export const SYSTEM = {
  en: [
    "You turn German Sign Language (DGS) glosses into one short, natural English sentence, as a news weather presenter would say it.",
    "The glosses are German words in sign order, not sentence order. Reorder and add small words (the, is, will, in) so it reads naturally.",
    "Use only what the glosses say. Do not add facts, places, numbers or weather that are not there.",
    "Ignore IX (pointing) and any '?' placeholder. loc-NORD / loc-SUED / loc-OST / loc-WEST mean north / south / east / west. A -PLUSPLUS suffix means repeated or strong.",
    "Number words that follow each other are one number: VIER ZWANZIG or ZWANZIG VIER is twenty-four, EINS ZEHN is eleven, DREI ZEHN is thirteen. In a date, say it as an ordinal (the twenty-fourth).",
    "If the glosses are too few or too unclear for a sentence, write the best short phrase you can instead of guessing.",
    "Reply with the sentence only: no quotes, no notes, no explanation.",
  ].join(" "),
  de: [
    "Du machst aus Glossen der Deutschen Gebärdensprache (DGS) einen kurzen, natürlichen deutschen Satz, so wie ihn ein Wetter-Moderator sagen würde.",
    "Die Glossen stehen in Gebärdenreihenfolge, nicht in Satzreihenfolge. Ordne um und ergänze kleine Wörter (der, ist, wird, in), damit es sich natürlich liest.",
    "Verwende nur, was in den Glossen steht. Erfinde keine Orte, Zahlen oder Wetterlagen.",
    "Ignoriere IX (Zeigen) und '?'-Platzhalter. loc-NORD / loc-SUED / loc-OST / loc-WEST heißen Norden / Süden / Osten / Westen. Ein Suffix -PLUSPLUS heißt wiederholt oder stark.",
    "Aufeinanderfolgende Zahlwörter sind eine Zahl: VIER ZWANZIG oder ZWANZIG VIER ist vierundzwanzig, EINS ZEHN ist elf, DREI ZEHN ist dreizehn. In einem Datum als Ordnungszahl (der vierundzwanzigste).",
    "Wenn die Glossen für einen Satz zu wenig oder zu unklar sind, schreibe die beste kurze Wendung, statt zu raten.",
    "Antworte nur mit dem Satz: keine Anführungszeichen, keine Anmerkungen, keine Erklärung.",
  ].join(" "),
};

// [glosses, english hint words, sentence]
const EXAMPLES = {
  en: [
    ["MORGEN WETTER WIE-AUSSEHEN MITTWOCH ZEHNTE NOVEMBER", "tomorrow · weather · how it looks · Wednesday · tenth · November", "Here is the weather for tomorrow, Wednesday the tenth of November."],
    ["loc-NORD REGEN-PLUSPLUS WIND STARK", "north · rain · wind · strong", "In the north there will be heavy rain and strong wind."],
    ["IX SONNE SUED WOLKE KEINE", "(pointing) · sun · south · cloud · none", "The south will be sunny with no clouds."],
    ["MONTAG TEMPERATUR NULL BIS ZEHN GRAD", "Monday · temperature · zero · to · ten · degrees", "On Monday temperatures will be between zero and ten degrees."],
    ["NACHT FROST GLATT", "night · frost · slippery", "Frost overnight, so roads may be slippery."],
    ["HEUTE FREITAG ZWANZIG ZWEI OKTOBER WETTER", "today · Friday · twenty · two · October · weather", "Today is Friday the twenty-second of October. Here is the weather."],
  ],
  de: [
    ["MORGEN WETTER WIE-AUSSEHEN MITTWOCH ZEHNTE NOVEMBER", "morgen · Wetter · wie sieht es aus · Mittwoch · zehnter · November", "So wird das Wetter morgen, am Mittwoch, dem zehnten November."],
    ["loc-NORD REGEN-PLUSPLUS WIND STARK", "Norden · Regen · Wind · stark", "Im Norden gibt es viel Regen und starken Wind."],
    ["IX SONNE SUED WOLKE KEINE", "(zeigen) · Sonne · Süden · Wolke · keine", "Im Süden scheint die Sonne, es bleibt wolkenlos."],
    ["MONTAG TEMPERATUR NULL BIS ZEHN GRAD", "Montag · Temperatur · null · bis · zehn · Grad", "Am Montag liegen die Temperaturen zwischen null und zehn Grad."],
    ["NACHT FROST GLATT", "Nacht · Frost · glatt", "In der Nacht gibt es Frost, die Straßen können glatt sein."],
    ["HEUTE FREITAG ZWANZIG ZWEI OKTOBER WETTER", "heute · Freitag · zwanzig · zwei · Oktober · Wetter", "Heute ist Freitag, der zweiundzwanzigste Oktober. Hier ist das Wetter."],
  ],
};

const userMessage = (glosses, hints) => `Glosses: ${glosses}${hints ? `\nWord hints: ${hints}` : ""}`;

/** Chat messages for one line: system, few-shot pairs, then the real line. */
export function buildMessages(glosses, hints, lang) {
  const shots = EXAMPLES[lang].flatMap(([g, h, s]) => [
    { role: "user", content: userMessage(g, h) },
    { role: "assistant", content: s },
  ]);
  return [{ role: "system", content: SYSTEM[lang] }, ...shots, { role: "user", content: userMessage(glosses, hints) }];
}

/** Strip reasoning blocks, quotes and line breaks from the model's answer. */
export function cleanSentence(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    .replace(/<think>[\s\S]*$/i, " ")
    .replace(/^\s*(sentence|satz)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["„“”'«»]+|["„“”'«»]+$/g, "")
    .trim();
}
