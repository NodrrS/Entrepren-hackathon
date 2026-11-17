/** Typed or spoken German -> DGS gloss steps for the pharmacy reply (known words become signs, the rest text cards). */
import { stepsFor, type DgsData, type Step } from "./dgs";
import { normalise } from "./words";

const DE_TO_GLOSS: Record<string, string> = {
  hallo: "HALLO",
  ich: "ICH", mir: "ICH", mich: "ICH",
  arzt: "ARZT", aerztin: "ARZT", doktor: "ARZT",
  gehen: "GEHEN", geh: "GEHEN", gehe: "GEHEN",
  deutsch: "DEUTSCH",
  "kann nicht": "KANN-NICHT", nicht: "KANN-NICHT",
  bitte: "BITTE",
  medikament: "MEDIKAMENT", medikamente: "MEDIKAMENT", tablette: "MEDIKAMENT", tabletten: "MEDIKAMENT", arznei: "MEDIKAMENT", medicine: "MEDIKAMENT", tablet: "MEDIKAMENT",
  zwei: "ZWEI", "2": "ZWEI", two: "ZWEI",
  woche: "WOCHE", wochen: "WOCHE", week: "WOCHE", weeks: "WOCHE",
  verstehen: "VERSTEHEN", verstanden: "VERSTEHEN", verstehe: "VERSTEHEN", understand: "VERSTEHEN",
  danke: "DANKE", dankeschoen: "DANKE", thanks: "DANKE", thank: "DANKE",
  zeigen: "ZEIGEN", zeig: "ZEIGEN", sehen: "ZEIGEN",
  dreimal: "DREI-MAL", "drei mal": "DREI-MAL",
  tag: "TAG", taeglich: "TAG",
  nach: "NACH",
  essen: "ESSEN", mahlzeit: "ESSEN",
  fuenf: "FÜNF", "5": "FÜNF",
  euro: "EURO",
  kopf: "KOPF", kopfschmerzen: "KOPF",
  schmerz: "SCHMERZ", schmerzen: "SCHMERZ",
  hier: "HIER",
  helfen: "HELFEN", hilfe: "HILFE",
  rezept: "REZEPT", prescription: "REZEPT",
  lesen: "LESEN",
};
const STOP = new Set(["die", "der", "das", "den", "dem", "des", "und", "ein", "eine", "einen", "zu", "zum", "zur", "am", "im", "sie", "es", "mit", "fuer", "lang", "kostet", "lassen", "dieses", "diese", "the", "a", "to", "for", "of"]);

export function textToSteps(text: string, d: DgsData): Step[] {
  const raw = text.split(/\s+/).filter(Boolean);
  const out: Step[] = [];
  for (let i = 0; i < raw.length; i++) {
    const two = i + 1 < raw.length ? normalise(`${raw[i]} ${raw[i + 1]}`) : "";
    if (two && DE_TO_GLOSS[two]) {
      out.push(...stepsFor([DE_TO_GLOSS[two]!], d));
      i++;
      continue;
    }
    const w = normalise(raw[i]!);
    if (!w || STOP.has(w)) continue;
    const g = DE_TO_GLOSS[w];
    if (g) out.push(...stepsFor([g], d));
    else out.push({ gloss: raw[i]!.toUpperCase(), de: raw[i]!.replace(/[.,!?;:]+$/, ""), en: "", available: false });
  }
  return out;
}
