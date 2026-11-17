/** ASL sign ids (PopSign ASL v1.0 names) <-> German words for the pharmacy demo. */

/** Display word for a recognised sign. */
export const SIGN_DE: Record<string, string> = {
  hello: "Hallo",
  sick: "krank",
  owie: "Schmerz",
  head: "Kopf",
  tooth: "Zahn",
  please: "bitte",
  thankyou: "danke",
  yes: "ja",
  no: "nein",
  water: "Wasser",
  wait: "warten",
  where: "wo",
  drink: "trinken",
  morning: "morgens",
  night: "abends / nachts",
  later: "später",
  sleep: "schlafen",
  now: "jetzt",
  time: "Zeit",
  finish: "fertig / danach",
  fine: "gut",
  tomorrow: "morgen",
  home: "zu Hause",
  haveto: "müssen",
  hot: "heiß",
};

/** German (and a few English) input words -> sign id. Keys are normalised (lower case, ä->ae ...). */
const WORDS: Record<string, string> = {
  hallo: "hello", hi: "hello", "guten tag": "hello", hello: "hello",
  krank: "sick", krankheit: "sick", sick: "sick",
  schmerz: "owie", schmerzen: "owie", weh: "owie", tut: "owie", hurt: "owie", pain: "owie",
  kopf: "head", kopfschmerzen: "head", head: "head",
  zahn: "tooth", zaehne: "tooth", zahnschmerzen: "tooth", tooth: "tooth",
  bitte: "please", please: "please",
  danke: "thankyou", dankeschoen: "thankyou", thanks: "thankyou", thank: "thankyou",
  ja: "yes", yes: "yes", genau: "yes",
  nein: "no", nicht: "no", no: "no", kein: "no", keine: "no",
  wasser: "water", water: "water",
  warten: "wait", warte: "wait", moment: "wait", wait: "wait",
  wo: "where", where: "where",
  trinken: "drink", trinkt: "drink", einnehmen: "drink", drink: "drink",
  morgens: "morning", frueh: "morning", morning: "morning",
  abends: "night", nachts: "night", abend: "night", nacht: "night", night: "night",
  spaeter: "later", later: "later",
  schlafen: "sleep", schlafengehen: "sleep", sleep: "sleep",
  jetzt: "now", sofort: "now", now: "now",
  zeit: "time", uhr: "time", time: "time",
  fertig: "finish", danach: "finish", nach: "finish", finish: "finish",
  gut: "fine", ok: "fine", okay: "fine", fine: "fine",
  morgen: "tomorrow", tomorrow: "tomorrow",
  hause: "home", zuhause: "home", "zu hause": "home", home: "home",
  muessen: "haveto", muss: "haveto", musst: "haveto", must: "haveto",
  heiss: "hot", warm: "hot", hot: "hot",
};

export function normalise(word: string): string {
  return word
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]/g, "");
}

export interface ReplyToken {
  readonly word: string;
  /** Sign id, or null when there is no sign for the word (shown as text only). */
  readonly sign: string | null;
}

/** Split a reply into words and map each to a sign (two-word phrases first). */
export function textToSigns(text: string): ReplyToken[] {
  const raw = text.split(/\s+/).filter(Boolean);
  const out: ReplyToken[] = [];
  for (let i = 0; i < raw.length; i++) {
    const two = i + 1 < raw.length ? normalise(`${raw[i]} ${raw[i + 1]}`) : "";
    if (two && WORDS[two]) {
      out.push({ word: `${raw[i]} ${raw[i + 1]}`, sign: WORDS[two]! });
      i++;
      continue;
    }
    const w = normalise(raw[i]!);
    if (!w || ["die", "der", "das", "den", "dem", "und", "mit", "ein", "eine", "einen", "zu", "zum", "zur", "am", "im", "vor", "sie", "ich", "es"].includes(w)) {
      out.push({ word: raw[i]!, sign: null });
      continue;
    }
    out.push({ word: raw[i]!, sign: WORDS[w] ?? null });
  }
  return out;
}

export interface QuickReply {
  readonly label: string;
  readonly text: string;
}

export const QUICK_REPLIES: readonly QuickReply[] = [
  { label: "Ja", text: "Ja" },
  { label: "Nein", text: "Nein" },
  { label: "Bitte warten", text: "Bitte warten" },
  { label: "Mit Wasser einnehmen", text: "Mit Wasser trinken" },
  { label: "Morgens", text: "Morgens" },
  { label: "Abends", text: "Abends" },
  { label: "Vor dem Schlafen", text: "Vor dem Schlafen" },
  { label: "Später", text: "Später" },
  { label: "Morgen wieder", text: "Morgen" },
  { label: "Danke", text: "Danke" },
];
