import { useSyncExternalStore } from "react";

/**
 * Latency metrics for the debug panel, measured in this browser only and kept in memory (nothing is sent or
 * stored). Only plain labels and milliseconds: no addresses, keys, model names or voice ids.
 */
export type MetricName = "model" | "sentence" | "speech" | "transcribe" | "picture";

export const METRIC_LABELS: Record<MetricName, string> = {
  model: "Sign model step",
  sentence: "Signs → sentence",
  speech: "Sentence → voice",
  transcribe: "Staff speech → text",
  picture: "Answer → pictures",
};

export interface Stat { last: number; avg: number; min: number; max: number; count: number }
type Snapshot = Partial<Record<MetricName, Stat>>;

const WINDOW = 50; // average over the last 50 measurements
const samples = new Map<MetricName, number[]>();
let snapshot: Snapshot = {};
const listeners = new Set<() => void>();
let pending = false;

function publish() {
  // Batch updates: the sign model reports every step, the panel only needs a few redraws a second.
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    const next: Snapshot = {};
    for (const [name, list] of samples) {
      next[name] = { last: list.at(-1)!, avg: list.reduce((a, b) => a + b, 0) / list.length, min: Math.min(...list), max: Math.max(...list), count: counts.get(name) ?? list.length };
    }
    snapshot = next;
    listeners.forEach((l) => l());
  }, 250);
}

const counts = new Map<MetricName, number>();

export function recordMetric(name: MetricName, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  const list = samples.get(name) ?? [];
  list.push(ms);
  if (list.length > WINDOW) list.shift();
  samples.set(name, list);
  counts.set(name, (counts.get(name) ?? 0) + 1);
  publish();
}

/** Times a promise and records it (only when it succeeds). */
export async function timed<T>(name: MetricName, work: Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await work;
  recordMetric(name, performance.now() - t0);
  return out;
}

export function clearMetrics(): void {
  samples.clear();
  counts.clear();
  snapshot = {};
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useMetrics(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

// ---- debug panel on/off: remembered in this browser (localStorage), or turned on with ?debug in the address
const KEY = "handsup-debug";
const debugListeners = new Set<() => void>();
let debugOn = (() => {
  try { return new URLSearchParams(location.search).has("debug") || localStorage.getItem(KEY) === "1"; } catch { return false; }
})();
export function setDebug(on: boolean): void {
  debugOn = on;
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* private mode: not remembered */ }
  debugListeners.forEach((l) => l());
}
export function useDebug(): boolean {
  return useSyncExternalStore((l) => { debugListeners.add(l); return () => { debugListeners.delete(l); }; }, () => debugOn);
}
