import type { GuidedTurn } from "./guided";

type Mark = "ok" | "loose" | "skip";

/**
 * The glosses a finished guided turn sends to the LLM: the steps that were recognised (by the rule, or loosely),
 * in order. Steps skipped with "Weiter" are left out, so the sentence only says what was really signed.
 */
export function recognisedGlosses(turn: Pick<GuidedTurn, "steps">, marks: readonly Mark[]): string {
  return turn.steps.filter((_, i) => marks[i] !== undefined && marks[i] !== "skip").map((st) => st.gloss).join(" ");
}
