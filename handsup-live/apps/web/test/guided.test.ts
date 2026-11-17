/// <reference types="node" />
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aspectCorrect, type RawSeqFrame } from "../src/pharmacy/classify";
import { TURN_1, TURN_3, checkStep } from "../src/pharmacy/guided";

const path = new URL("../public/pharmacy/dgs/dgs.json", import.meta.url);
const have = existsSync(path);

function clip(d: { signs: Record<string, { skeleton: { frames: number; width: number; height: number; keypoints_b64: string; present: number[][] } }> }, g: string): RawSeqFrame[] {
  const s = d.signs[g]!.skeleton;
  const b = Buffer.from(s.keypoints_b64, "base64");
  const f = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
  return s.present.map((p, i) => aspectCorrect({ points: f.subarray(i * 225, (i + 1) * 225), present: p.map(Boolean) }, s.width, s.height));
}

describe.skipIf(!have)("guided rules on the SignDict signs (local data)", () => {
  const d = have ? JSON.parse(readFileSync(path, "utf8")) : null;
  const step = (g: string) => [...TURN_1.steps, ...TURN_3.steps].find((s) => s.gloss === g)!;
  it("reports which recorded signs pass which rule", () => {
    const rows: string[] = [];
    for (const rule of ["HALLO", "BITTE", "DANKE"]) {
      const passes = Object.keys(d.signs).filter((g) => checkStep(step(rule), clip(d, g)).ok);
      rows.push(`${rule}: ${passes.join(",")}`);
    }
    // the own clip must pass its own rule
    expect(checkStep(step("HALLO"), clip(d, "HALLO")).ok, rows.join(" | ")).toBe(true);
    expect(checkStep(step("BITTE"), clip(d, "BITTE")).ok, rows.join(" | ")).toBe(true);
    expect(checkStep(step("DANKE"), clip(d, "DANKE")).ok, rows.join(" | ")).toBe(true);
    console.info(rows.join("\n"));
  });
});
