import { describe, expect, it } from "vitest";
import { pickRoute } from "../src/lib/route";
import { MOCK_TURNS, mockSentence } from "../src/lib/mockSigner";
import { QUICK_COUNTER, QUICK_PHONE, builtinReply } from "../src/lib/replies";
import { TARGET_RATE, downsample, encodeWav } from "../src/lib/recordWav";

describe("pickRoute", () => {
  it("uses the path when it says which mode, else the screen width", () => {
    expect(pickRoute("/signer", 1400)).toBe("signer");
    expect(pickRoute("/counter/", 375)).toBe("counter");
    expect(pickRoute("/", 375)).toBe("signer");
    expect(pickRoute("/", 767)).toBe("signer");
    expect(pickRoute("/", 768)).toBe("counter");
    expect(pickRoute("/anything", 1194)).toBe("counter");
  });
});

describe("mock dialogue", () => {
  it("has the pharmacy request then No, with fixed sentences in both languages", () => {
    expect(MOCK_TURNS.map((t) => t.glosses.map((g) => g[0]).join(" "))).toEqual(["HALLO MEDIKAMENT KOPF SCHMERZ", "NEIN"]);
    expect(mockSentence({ de: "HALLO MEDIKAMENT KOPF SCHMERZ" }, "en")).toBe("Hello. I need medicine for a headache.");
    expect(mockSentence({ de: "NEIN" }, "de")).toBe("Nein.");
    expect(mockSentence({ de: "MORGEN WETTER" }, "en")).toBeUndefined();
  });
});

describe("built-in replies", () => {
  it("covers every quick reply in both languages, with picture tiles", () => {
    for (const lang of ["en", "de"] as const) {
      for (const q of [...QUICK_COUNTER[lang], ...QUICK_PHONE[lang]]) {
        const r = builtinReply(q, lang);
        expect(r, `${lang}: ${q}`).not.toBeNull();
        expect(r!.tiles.length).toBeGreaterThan(0);
        expect(r!.sentence.length).toBeGreaterThan(0);
      }
    }
  });

  it("knows the mockup's full answer, ignoring case, quotes and the final dot", () => {
    const r = builtinReply("“This one is €6.50. Take one tablet up to three times a day”", "en");
    expect(r?.tiles.map((t) => t.value)).toEqual(["1", "3×", "€6.50"]);
    expect(r?.sentence).toBe("1 tablet. Up to 3 times a day. €6.50.");
    expect(builtinReply("Something else entirely", "en")).toBeNull();
  });
});

describe("WAV recording helpers", () => {
  it("downsamples to 16 kHz", () => {
    expect(downsample(new Float32Array(48000), 48000).length).toBe(TARGET_RATE);
    const same = new Float32Array(100);
    expect(downsample(same, 16000)).toBe(same);
  });

  it("writes a valid 16-bit mono WAV header", () => {
    const bytes = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]));
    const v = new DataView(bytes.buffer);
    const str = (o: number, n: number) => String.fromCharCode(...bytes.slice(o, o + n));
    expect(str(0, 4)).toBe("RIFF");
    expect(str(8, 4)).toBe("WAVE");
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16); // bits
    expect(v.getUint32(40, true)).toBe(10); // 5 samples × 2 bytes
    expect(bytes.length).toBe(54);
    expect(v.getInt16(44 + 6, true)).toBe(0x7fff);
    expect(v.getInt16(44 + 8, true)).toBe(-0x8000);
  });
});
