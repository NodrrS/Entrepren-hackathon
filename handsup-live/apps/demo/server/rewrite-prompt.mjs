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
    "WIE-AUSSEHEN (how it looks) is how a presenter introduces a forecast: say 'Here is the weather for ...' instead of translating it word for word. JETZT (now) at the start is only an opener: leave it out.",
    "Number words that follow each other are one number: VIER ZWANZIG or ZWANZIG VIER is twenty-four, EINS ZEHN is eleven, DREI ZEHN is thirteen. In a date, say it as an ordinal (the twenty-fourth).",
    "If the glosses are too few or too unclear for a sentence, write the best short phrase you can instead of guessing.",
    "Reply with the sentence only: no quotes, no notes, no explanation.",
  ].join(" "),
  de: [
    "Du machst aus Glossen der Deutschen Gebärdensprache (DGS) einen kurzen, natürlichen deutschen Satz, so wie ihn ein Wetter-Moderator sagen würde.",
    "Die Glossen stehen in Gebärdenreihenfolge, nicht in Satzreihenfolge. Ordne um und ergänze kleine Wörter (der, ist, wird, in), damit es sich natürlich liest.",
    "Verwende nur, was in den Glossen steht. Erfinde keine Orte, Zahlen oder Wetterlagen.",
    "Ignoriere IX (Zeigen) und '?'-Platzhalter. loc-NORD / loc-SUED / loc-OST / loc-WEST heißen Norden / Süden / Osten / Westen. Ein Suffix -PLUSPLUS heißt wiederholt oder stark.",
    "WIE-AUSSEHEN ist die Einleitung einer Vorhersage: sage 'So wird das Wetter ...' statt Wort für Wort zu übersetzen. JETZT am Anfang ist nur ein Auftakt: lass es weg.",
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
    ["JETZT WIE-AUSSEHEN WETTER MORGEN SAMSTAG DREI ZEHN DEZEMBER", "now · how it looks · weather · tomorrow · Saturday · three · ten · December", "Here is the weather for tomorrow, Saturday the thirteenth of December."],
    ["NACHT FUENF GRAD SEE MINUS ZWEI FLUSS", "night · five · degrees · lake · minus · two · river", "Overnight it will be five degrees by the lake and minus two by the river."],
    ["HEUTE FREITAG ZWANZIG ZWEI OKTOBER WETTER", "today · Friday · twenty · two · October · weather", "Today is Friday the twenty-second of October. Here is the weather."],
  ],
  de: [
    ["MORGEN WETTER WIE-AUSSEHEN MITTWOCH ZEHNTE NOVEMBER", "morgen · Wetter · wie sieht es aus · Mittwoch · zehnter · November", "So wird das Wetter morgen, am Mittwoch, dem zehnten November."],
    ["loc-NORD REGEN-PLUSPLUS WIND STARK", "Norden · Regen · Wind · stark", "Im Norden gibt es viel Regen und starken Wind."],
    ["IX SONNE SUED WOLKE KEINE", "(zeigen) · Sonne · Süden · Wolke · keine", "Im Süden scheint die Sonne, es bleibt wolkenlos."],
    ["MONTAG TEMPERATUR NULL BIS ZEHN GRAD", "Montag · Temperatur · null · bis · zehn · Grad", "Am Montag liegen die Temperaturen zwischen null und zehn Grad."],
    ["NACHT FROST GLATT", "Nacht · Frost · glatt", "In der Nacht gibt es Frost, die Straßen können glatt sein."],
    ["JETZT WIE-AUSSEHEN WETTER MORGEN SAMSTAG DREI ZEHN DEZEMBER", "jetzt · wie sieht es aus · Wetter · morgen · Samstag · drei · zehn · Dezember", "So wird das Wetter morgen, am Samstag, dem dreizehnten Dezember."],
    ["NACHT FUENF GRAD SEE MINUS ZWEI FLUSS", "Nacht · fünf · Grad · See · minus · zwei · Fluss", "In der Nacht hat es fünf Grad am See und minus zwei Grad am Fluss."],
    ["HEUTE FREITAG ZWANZIG ZWEI OKTOBER WETTER", "heute · Freitag · zwanzig · zwei · Oktober · Wetter", "Heute ist Freitag, der zweiundzwanzigste Oktober. Hier ist das Wetter."],
  ],
};

// Pharmacy topic: the guided DGS scenario (a Deaf customer at the counter). The sentences are what the customer
// means, in the first person, from the signs that were recognised (skipped signs are not sent).
const PHARMACY_SYSTEM = {
  en: [
    "You turn German Sign Language (DGS) glosses from a Deaf customer at a pharmacy counter into what the customer means: short, natural English, in the first person, as the customer would say it to the pharmacist.",
    "The glosses are in sign order. HIER is pointing at something (here is ...), REZEPT is the prescription, ARZT the doctor, GEHEN went, KANN-NICHT cannot, HILFE or HELFEN help.",
    "Use only what the glosses say. Do not add symptoms, medicines, doses or facts. If some signs are missing, write what the remaining signs mean.",
    "Reply with the sentences only: no quotes, no notes, no explanation.",
  ].join(" "),
  de: [
    "Du machst aus Glossen der Deutschen Gebärdensprache (DGS) einer gehörlosen Kundin an der Apothekentheke das, was sie meint: kurz, natürlich, auf Deutsch, in der Ich-Form, so wie sie es zur Apothekerin sagen würde.",
    "Die Glossen stehen in Gebärdenreihenfolge. HIER zeigt auf etwas (hier ist ...), REZEPT ist das Rezept, ARZT der Arzt, GEHEN war (gegangen), KANN-NICHT kann nicht, HILFE oder HELFEN Hilfe.",
    "Verwende nur, was in den Glossen steht. Füge keine Beschwerden, Medikamente, Dosen oder Fakten hinzu. Fehlen Gebärden, schreibe, was die übrigen bedeuten.",
    "Antworte nur mit den Sätzen: keine Anführungszeichen, keine Anmerkungen, keine Erklärung.",
  ].join(" "),
};

const PHARMACY_EXAMPLES = {
  en: [
    ["HALLO KOPF SCHMERZ ARZT GEHEN HIER REZEPT DEUTSCH LESEN KANN-NICHT BITTE HELFEN", "Hello, I have a headache. I went to the doctor, here is the prescription. I can't read German, please help me."],
    ["HALLO KOPF SCHMERZ REZEPT", "Hello, I have a headache. I have a prescription."],
    ["HALLO ARZT REZEPT BITTE HELFEN", "Hello, I have a prescription from the doctor. Please help me."],
    ["KOPF SCHMERZ GEHEN REZEPT LESEN KANN-NICHT", "I have a headache. I went and got a prescription. I can't read it."],
    ["VERSTEHEN DANKE HILFE", "Ah, I understand. Thank you for your help."],
    ["DANKE", "Thank you."],
  ],
  de: [
    ["HALLO KOPF SCHMERZ ARZT GEHEN HIER REZEPT DEUTSCH LESEN KANN-NICHT BITTE HELFEN", "Hallo, ich habe Kopfschmerzen. Ich war beim Arzt, hier ist das Rezept. Ich kann kein Deutsch lesen, bitte helfen Sie mir."],
    ["HALLO KOPF SCHMERZ REZEPT", "Hallo, ich habe Kopfschmerzen. Ich habe ein Rezept."],
    ["HALLO ARZT REZEPT BITTE HELFEN", "Hallo, ich habe ein Rezept vom Arzt. Bitte helfen Sie mir."],
    ["KOPF SCHMERZ GEHEN REZEPT LESEN KANN-NICHT", "Ich habe Kopfschmerzen. Ich war unterwegs und habe ein Rezept. Ich kann es nicht lesen."],
    ["VERSTEHEN DANKE HILFE", "Ah, ich verstehe. Danke für Ihre Hilfe."],
    ["DANKE", "Danke."],
  ],
};

export const TOPICS = ["weather", "pharmacy"];

const userMessage = (glosses, hints) => `Glosses: ${glosses}${hints ? `\nWord hints: ${hints}` : ""}`;

/** Chat messages for one line: system, few-shot pairs, then the real line. `topic`: "weather" (default) or "pharmacy". */
export function buildMessages(glosses, hints, lang, topic = "weather") {
  if (topic === "pharmacy") {
    const shots = PHARMACY_EXAMPLES[lang].flatMap(([g, s]) => [{ role: "user", content: userMessage(g, "") }, { role: "assistant", content: s }]);
    return [{ role: "system", content: PHARMACY_SYSTEM[lang] }, ...shots, { role: "user", content: userMessage(glosses, hints) }];
  }
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
