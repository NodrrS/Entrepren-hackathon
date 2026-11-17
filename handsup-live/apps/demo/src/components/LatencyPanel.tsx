import { useState } from "react";
import { Gauge, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { METRIC_LABELS, clearMetrics, setDebug, useMetrics, type MetricName } from "@/lib/metrics";

const fmt = (ms: number | undefined) => (ms === undefined ? "–" : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);

/**
 * Small debug panel with the latency of each step, measured in this browser. "inline" sits in the page (counter
 * view); "floating" is a small pill at the bottom of the phone screen that opens into the table.
 */
export function LatencyPanel({ variant = "inline" }: { variant?: "inline" | "floating" }) {
  const m = useMetrics();
  const [open, setOpen] = useState(false);
  if (variant === "floating" && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label="Show latency details"
        className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 z-40 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-stage/90 px-3 text-xs font-semibold text-white tabular-nums shadow-lg">
        <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
        {fmt(m.sentence?.last)} · {fmt(m.speech?.last)}
      </button>
    );
  }
  return (
    <aside aria-label="Latency" className={cn("rounded-2xl bg-stage p-3 text-white", variant === "floating" && "fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-2 z-40 w-[min(22rem,calc(100vw-1rem))] bg-stage/95 shadow-lg backdrop-blur")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase">Latency</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={clearMetrics} className="min-h-8 rounded-full px-3 text-xs font-semibold text-white/80 hover:bg-white/10">Reset</button>
          <button type="button" onClick={() => (variant === "floating" ? setOpen(false) : setDebug(false))} aria-label={variant === "floating" ? "Make smaller" : "Hide latency"} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <table className="w-full text-[13px] tabular-nums">
        <thead className="text-white/60">
          <tr><th className="pb-1 text-left font-medium">Step</th><th className="pb-1 text-right font-medium">Last</th><th className="pb-1 text-right font-medium">Avg</th><th className="pb-1 text-right font-medium">n</th></tr>
        </thead>
        <tbody>
          {(Object.keys(METRIC_LABELS) as MetricName[]).map((k) => (
            <tr key={k} className="border-t border-white/10">
              <td className="py-1 pr-2">{METRIC_LABELS[k]}</td>
              <td className="py-1 text-right">{fmt(m[k]?.last)}</td>
              <td className="py-1 text-right">{fmt(m[k]?.avg)}</td>
              <td className="py-1 text-right text-white/60">{m[k]?.count ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 mt-2 text-[11px] text-white/50">Measured in this browser, round trip. Not sent anywhere.</p>
    </aside>
  );
}
