// Copied unchanged from apps/web/src/privacy.ts (Hands Up live app). Keep in sync by hand; a later API swap removes the need.
/**
 * Network guard (D-004 network silence). Blocks every request that is not to this page's own
 * origin, and counts what it blocked so the UI can show it.
 *
 * Why this exists: `@mediapipe/tasks-vision` 1.0.1 bundles a usage logger that POSTs task
 * type, running mode, OS and latency statistics to https://odml.pa.googleapis.com/v1/log every
 * 60 s and on close. The Content-Security-Policy in index.html (`connect-src 'self'`) already
 * blocks it at the browser level; this guard is a second layer that also works where a CSP is
 * missing, and it makes blocked attempts visible.
 */

export interface BlockedRequest {
  readonly api: "fetch" | "xhr" | "beacon" | "websocket";
  readonly url: string;
}

export interface NetworkGuard {
  readonly blocked: readonly BlockedRequest[];
  onBlocked(listener: (r: BlockedRequest) => void): () => void;
  /** Restore the original APIs (tests). */
  uninstall(): void;
}

interface GuardableWindow {
  location: { origin: string; href: string };
  fetch: typeof fetch;
  XMLHttpRequest: typeof XMLHttpRequest;
  WebSocket: typeof WebSocket;
  navigator: { sendBeacon?: (url: string | URL, data?: BodyInit | null) => boolean };
}

export function isSameOrigin(url: string | URL, base: { origin: string; href: string }): boolean {
  try {
    const u = new URL(String(url), base.href);
    // blob: and data: URLs never leave the device.
    if (u.protocol === "blob:" || u.protocol === "data:") return true;
    const origin = u.protocol === "ws:" ? u.origin.replace(/^ws:/, "http:") : u.protocol === "wss:" ? u.origin.replace(/^wss:/, "https:") : u.origin;
    return origin === base.origin;
  } catch {
    return false;
  }
}

export function installNetworkGuard(win: GuardableWindow): NetworkGuard {
  const blocked: BlockedRequest[] = [];
  const listeners = new Set<(r: BlockedRequest) => void>();
  const record = (r: BlockedRequest) => {
    blocked.push(r);
    if (blocked.length > 100) blocked.shift(); // bounded
    for (const l of listeners) l(r);
  };

  const origFetch = win.fetch;
  const OrigXhr = win.XMLHttpRequest;
  const OrigWs = win.WebSocket;
  const origBeacon = win.navigator.sendBeacon;

  win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (!isSameOrigin(url, win.location)) {
      record({ api: "fetch", url });
      return Promise.reject(new TypeError(`Blocked by the Hands Up network guard: ${url}`));
    }
    // fetch must be called with the window as `this`.
    return origFetch.call(win, input, init);
  }) as typeof fetch;

  win.XMLHttpRequest = class GuardedXhr extends OrigXhr {
    override open(method: string, url: string | URL, ...rest: unknown[]): void {
      if (!isSameOrigin(url, win.location)) {
        record({ api: "xhr", url: String(url) });
        throw new TypeError(`Blocked by the Hands Up network guard: ${String(url)}`);
      }
      (super.open as (...a: unknown[]) => void)(method, url, ...rest);
    }
  } as typeof XMLHttpRequest;

  win.WebSocket = class GuardedWs extends OrigWs {
    constructor(url: string | URL, protocols?: string | string[]) {
      if (!isSameOrigin(url, win.location)) {
        record({ api: "websocket", url: String(url) });
        throw new TypeError(`Blocked by the Hands Up network guard: ${String(url)}`);
      }
      super(url, protocols);
    }
  } as typeof WebSocket;

  if (typeof origBeacon === "function") {
    win.navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      if (!isSameOrigin(url, win.location)) {
        record({ api: "beacon", url: String(url) });
        return false;
      }
      return origBeacon.call(win.navigator, url, data);
    };
  }

  return {
    blocked,
    onBlocked(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    uninstall() {
      win.fetch = origFetch;
      win.XMLHttpRequest = OrigXhr;
      win.WebSocket = OrigWs;
      if (typeof origBeacon === "function") win.navigator.sendBeacon = origBeacon;
      listeners.clear();
    },
  };
}
