import { describe, expect, it } from "vitest";
import { METRIC_LABELS, clearMetrics, recordMetric, timed } from "../src/lib/metrics";

describe("latency metrics", () => {
  it("records only finite, non-negative times and times successful work only", async () => {
    clearMetrics();
    recordMetric("speech", 100);
    recordMetric("speech", Number.NaN);
    recordMetric("speech", -5);
    await expect(timed("picture", Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(await timed("sentence", Promise.resolve(42))).toBe(42);
  });

  it("labels are plain step names with nothing about the servers", () => {
    for (const label of Object.values(METRIC_LABELS)) {
      expect(label).not.toMatch(/https?:|\d+\.\d+\.\d+|metacon|qwen|voice-|key|:\d{2,5}/i);
    }
  });
});
