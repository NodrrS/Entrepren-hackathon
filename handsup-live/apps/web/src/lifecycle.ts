/**
 * Camera lifecycle (privacy): the camera stops as soon as the tab is hidden or the page is being
 * closed or navigated away from. It does NOT restart by itself; the user presses Start again.
 */

interface EventSourceLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface LifecycleTargets {
  readonly document: EventSourceLike & { readonly visibilityState: string };
  readonly window: EventSourceLike;
}

export type StopReason = "hidden" | "pagehide" | "unload";

/** Calls `stop(reason)` when the page is hidden or unloaded. Returns an unbind function. */
export function bindCameraLifecycle(targets: LifecycleTargets, stop: (reason: StopReason) => void): () => void {
  const onVisibility = () => {
    if (targets.document.visibilityState === "hidden") stop("hidden");
  };
  const onPageHide = () => stop("pagehide");
  const onBeforeUnload = () => stop("unload");
  targets.document.addEventListener("visibilitychange", onVisibility);
  targets.window.addEventListener("pagehide", onPageHide);
  targets.window.addEventListener("beforeunload", onBeforeUnload);
  return () => {
    targets.document.removeEventListener("visibilitychange", onVisibility);
    targets.window.removeEventListener("pagehide", onPageHide);
    targets.window.removeEventListener("beforeunload", onBeforeUnload);
  };
}
