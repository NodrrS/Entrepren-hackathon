/**
 * React hook over the recognizer engine. The UI only talks to this file (the contract Lovable's page was built
 * against); to use a hosted recognition API later, swap the engine behind it (see recognizer/engine.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { RecognizerEngine, type CaptionLine, type Mode, type Phase, type Snapshot, type StatusKind } from "./recognizer/engine";

export type Lang = "en" | "de";
export type RecognizerMode = Mode;
export type RecognizerPhase = Phase;
export type { CaptionLine };

export interface RecognizerApi {
  phase: RecognizerPhase;
  statusText: string;
  statusKind: StatusKind;
  progress: number;
  mode: RecognizerMode;
  lines: CaptionLine[];
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  showSkeleton: boolean;
  setShowSkeleton(v: boolean): void;
  startCamera(): Promise<void>;
  startDemo(): Promise<void>;
  startUpload(file: File): Promise<void>;
  stop(): void;
  onLineFinal(cb: (line: CaptionLine) => void): () => void;
}

const EMPTY: Snapshot = {
  phase: "loading",
  statusText: "Loading the models…",
  statusKind: "info",
  progress: 0,
  mode: "idle",
  lines: [],
  showSkeleton: true,
};
const noopSubscribe = (): (() => void) => () => {};
const getEmpty = (): Snapshot => EMPTY;

export function useRecognizer(): RecognizerApi {
  const videoRef = useRef<HTMLVideoElement>(null) as RefObject<HTMLVideoElement>;
  const canvasRef = useRef<HTMLCanvasElement>(null) as RefObject<HTMLCanvasElement>;
  const [engine, setEngine] = useState<RecognizerEngine | null>(null);
  const engineRef = useRef<RecognizerEngine | null>(null);
  const finalCbs = useRef(new Set<(line: CaptionLine) => void>());

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const e = new RecognizerEngine(video, canvas);
    const off = e.onLineFinal((line) => {
      for (const cb of finalCbs.current) cb(line);
    });
    engineRef.current = e;
    setEngine(e);
    return () => {
      off();
      e.dispose();
      engineRef.current = null;
      setEngine(null);
    };
  }, [videoRef, canvasRef]);

  const snap = useSyncExternalStore(engine ? engine.subscribe : noopSubscribe, engine ? engine.getSnapshot : getEmpty);

  const startCamera = useCallback(async () => void (await engineRef.current?.startCamera()), []);
  const startDemo = useCallback(async () => void (await engineRef.current?.startDemo()), []);
  const startUpload = useCallback(async (file: File) => void (await engineRef.current?.startUpload(file)), []);
  const stop = useCallback(() => engineRef.current?.stop(), []);
  const setShowSkeleton = useCallback((v: boolean) => engineRef.current?.setShowSkeleton(v), []);
  const onLineFinal = useCallback((cb: (line: CaptionLine) => void) => {
    finalCbs.current.add(cb);
    return () => {
      finalCbs.current.delete(cb);
    };
  }, []);

  return useMemo(
    () => ({
      phase: snap.phase,
      statusText: snap.statusText,
      statusKind: snap.statusKind,
      progress: snap.progress,
      mode: snap.mode,
      lines: snap.lines,
      videoRef,
      canvasRef,
      showSkeleton: snap.showSkeleton,
      setShowSkeleton,
      startCamera,
      startDemo,
      startUpload,
      stop,
      onLineFinal,
    }),
    [snap, videoRef, canvasRef, setShowSkeleton, startCamera, startDemo, startUpload, stop, onLineFinal],
  );
}
