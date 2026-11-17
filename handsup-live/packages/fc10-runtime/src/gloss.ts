/** Gloss ids -> display strings: the German gloss and a rough English word (or unknown). */
import table from "./gloss-en.json";

const WORDS = (table as { words: Record<string, string | null> }).words;

export interface GlossLabel {
  readonly id: number;
  readonly gloss: string;
  /** Rough English word; null = unknown (shown as such). */
  readonly english: string | null;
  /** Special tokens (__ON__, __OFF__, blank, <unk>, ...) are not shown as captions. */
  readonly hidden: boolean;
}

export function makeLabeler(itos: readonly string[]): (id: number) => GlossLabel {
  return (id) => {
    const gloss = itos[id] ?? "<unk>";
    const english = gloss in WORDS ? WORDS[gloss]! : null;
    return { id, gloss, english: english === "" ? null : english, hidden: english === "" || id === 0 };
  };
}
