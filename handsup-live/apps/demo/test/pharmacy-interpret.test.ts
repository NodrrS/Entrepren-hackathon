import { describe, expect, it } from "vitest";
import { recognisedGlosses } from "../src/lib/pharmacy/interpret";
import { TURN_1, TURN_3 } from "../src/lib/pharmacy/guided";
// @ts-expect-error plain .mjs module without types
import { TOPICS, buildMessages } from "../server/rewrite-prompt.mjs";

describe("pharmacy turn -> LLM input", () => {
  it("sends the recognised signs in order and leaves skipped ones out", () => {
    const marks = TURN_1.steps.map((_, i) => (i % 3 === 2 ? "skip" : i % 2 ? "loose" : "ok")) as Array<"ok" | "loose" | "skip">;
    const sent = recognisedGlosses(TURN_1, marks).split(" ");
    expect(sent).toEqual(TURN_1.steps.filter((_, i) => marks[i] !== "skip").map((s) => s.gloss));
    expect(sent).not.toContain(TURN_1.steps[2]!.gloss);
  });

  it("sends nothing when every sign was skipped (the written sentence is used then)", () => {
    expect(recognisedGlosses(TURN_3, TURN_3.steps.map(() => "skip" as const))).toBe("");
    expect(recognisedGlosses(TURN_3, [])).toBe("");
  });

  it("the pharmacy topic has its own prompt; weather stays the default", () => {
    expect(TOPICS).toEqual(["weather", "pharmacy"]);
    const ph = buildMessages("HALLO REZEPT", "", "en", "pharmacy");
    expect(ph[0].content).toContain("pharmacy counter");
    expect(ph.at(-1).content).toBe("Glosses: HALLO REZEPT");
    expect(buildMessages("MORGEN", "", "en")[0].content).toContain("weather");
    expect(buildMessages("HALLO", "", "de", "pharmacy")[0].content).toContain("Apothekentheke");
  });
});
