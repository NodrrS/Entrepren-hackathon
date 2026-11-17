import type { ReactNode, RefObject } from "react";
import { LogoMark } from "./Logo";
import { cn } from "@/lib/utils";

/** The dark camera stage of mockup 4: status label, skeleton toggle, video + skeleton canvas, caption card at the bottom. */
export function Stage({ videoRef, canvasRef, running, hint, label, showSkeleton, onToggleSkeleton, drag, dropHandlers, caption, className }: {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  running: boolean;
  /** Show the "start your camera" hint (nothing running and no captions yet). */
  hint: boolean;
  label: string;
  showSkeleton: boolean;
  onToggleSkeleton: () => void;
  drag: boolean;
  dropHandlers: Record<string, unknown>;
  caption: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      {...dropHandlers}
      className={cn("relative flex min-h-[32rem] flex-col gap-3 overflow-hidden rounded-[22px] bg-stage p-[18px]", drag && "ring-2 ring-primary", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-white">
          <span className={cn("h-2.5 w-2.5 rounded-full", running ? "bg-primary" : "bg-white/40")} aria-hidden="true" />
          {label}
        </span>
        <button type="button" onClick={onToggleSkeleton} aria-pressed={!showSkeleton}
          className="min-h-11 rounded-[22px] bg-stage-chip px-4 text-sm font-semibold text-white hover:bg-white/20">
          {showSkeleton ? "Hide skeleton" : "Show skeleton"}
        </button>
      </div>
      {/* The video gets its own area: the caption card below never covers the signer. */}
      <div className="relative min-h-[14rem] flex-1 overflow-hidden rounded-xl">
        {/* Fit and mirroring (camera only) are set by the recognizer engine on both the video and the canvas, so they stay aligned. */}
        <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
        {hint && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <LogoMark className="h-14 w-14 text-primary" />
            <p className="max-w-xs px-6 text-[15px] text-white/60">Start your camera, upload a clip, or play an example</p>
          </div>
        )}
      </div>
      {caption}
    </div>
  );
}
