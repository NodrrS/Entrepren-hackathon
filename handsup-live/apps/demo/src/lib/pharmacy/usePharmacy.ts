/**
 * Pharmacy mode for the team app: the guided DGS scenario on the live camera (rolling-window feature rules,
 * Assistenz), with fc10 (weather) switched off, plus the DGS sign data for the reply player. Outputs only the
 * scenario words of the current turn, in order.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { rawFromHuFrame } from "@handsup/fc10-runtime";
import type { RecognizerApi } from "@/lib/recognizer";
import { aspectCorrect, type RawSeqFrame } from "./classify";
import { loadDgs, type DgsData } from "./dgs";
import { GuidedTracker, TURN_1, TURN_3, type GuidedTurn, type TrackerDebug } from "./guided";

export type Mark = "ok" | "loose" | "skip";
export const TURNS: readonly GuidedTurn[] = [TURN_1, TURN_3];

export interface PharmacyState {
  turn: GuidedTurn | null;
  index: number;
  marks: Mark[];
  debug: TrackerDebug | null;
}

export function usePharmacy(real: RecognizerApi, onTurnDone: (turn: GuidedTurn, marks: Mark[]) => void) {
  const [on, setOn] = useState(false);
  const [assist, setAssistState] = useState(true);
  const [state, setState] = useState<PharmacyState>({ turn: null, index: 0, marks: [], debug: null });
  const [data, setData] = useState<DgsData | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const tracker = useRef<GuidedTracker | null>(null);
  const marks = useRef<Mark[]>([]);
  const doneCb = useRef(onTurnDone);
  doneCb.current = onTurnDone;

  // fc10 (weather) only runs outside pharmacy mode
  useEffect(() => {
    real.setFc10Enabled(!on);
    return () => real.setFc10Enabled(true);
  }, [on, real]);

  useEffect(() => {
    if (!on || data) return;
    loadDgs().then(setData, (e: Error) => setDataError(e.message));
  }, [on, data]);

  const advance = useCallback((mark: Mark) => {
    const t = tracker.current;
    if (!t) return;
    marks.current = [...marks.current, mark];
    const turn = t.turn;
    if (t.done) {
      tracker.current = null;
      setState({ turn, index: turn.steps.length, marks: marks.current, debug: null });
      doneCb.current(turn, marks.current);
    } else setState((s) => ({ ...s, index: t.index, marks: marks.current }));
  }, []);

  // 25 FPS resampling of the camera frames (nearest frame), then the rolling-window rules
  useEffect(() => {
    let tick0 = -1, k = 0, lastDebug = 0;
    let last: { t: number; f: RawSeqFrame } | null = null;
    return real.onLandmarks((frame) => {
      const t = tracker.current;
      if (!t) return;
      const f = aspectCorrect(rawFromHuFrame(frame), frame.image.width, frame.image.height);
      const ts = frame.timestampMs;
      if (tick0 < 0 || (last && ts - last.t > 1000)) { tick0 = ts; k = 0; }
      for (let tick = tick0 + k * 40; tick <= ts; tick = tick0 + k * 40) {
        const fr = last && tick - last.t < ts - tick ? last.f : f;
        const a = tracker.current?.push(fr);
        k++;
        if (a) advance(a.how === "rule" ? "ok" : "loose");
      }
      last = { t: ts, f };
      const now = performance.now();
      if (tracker.current && now - lastDebug > 150) {
        lastDebug = now;
        const d = { ...tracker.current.debug };
        setState((s) => ({ ...s, debug: d }));
      }
    });
  }, [real, advance]);

  const startTurn = useCallback(async (turn: GuidedTurn) => {
    const t = new GuidedTracker(turn);
    t.assist = assist;
    tracker.current = t;
    marks.current = [];
    setState({ turn, index: 0, marks: [], debug: null });
    if (real.mode !== "camera") await real.startCamera();
  }, [assist, real]);

  const skip = useCallback(() => {
    tracker.current?.skip();
    advance("skip");
  }, [advance]);

  const stopTurn = useCallback(() => {
    tracker.current = null;
    setState({ turn: null, index: 0, marks: [], debug: null });
  }, []);

  const setAssist = useCallback((v: boolean) => {
    setAssistState(v);
    if (tracker.current) tracker.current.assist = v;
  }, []);

  return { on, setOn, assist, setAssist, state, data, dataError, startTurn, skip, stopTurn, active: !!tracker.current };
}
