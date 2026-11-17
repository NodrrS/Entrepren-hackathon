import { describe, expect, it } from "vitest";
import { installNetworkGuard, isSameOrigin } from "../src/privacy";

const location = { origin: "http://localhost:5173", href: "http://localhost:5173/" };

function fakeWindow() {
  const calls: string[] = [];
  class Xhr {
    open(_m: string, url: string | URL) {
      calls.push(`xhr ${String(url)}`);
    }
  }
  class Ws {
    constructor(url: string | URL) {
      calls.push(`ws ${String(url)}`);
    }
  }
  const win = {
    location,
    fetch: (async (input: RequestInfo | URL) => {
      calls.push(`fetch ${String(input)}`);
      return new Response("ok");
    }) as typeof fetch,
    XMLHttpRequest: Xhr as unknown as typeof XMLHttpRequest,
    WebSocket: Ws as unknown as typeof WebSocket,
    navigator: {
      sendBeacon: (url: string | URL) => {
        calls.push(`beacon ${String(url)}`);
        return true;
      },
    } as { sendBeacon?: (url: string | URL, data?: BodyInit | null) => boolean },
  };
  return { win, calls };
}

describe("isSameOrigin", () => {
  it("allows relative, same-origin, blob and same-host websocket URLs", () => {
    expect(isSameOrigin("/models/x.task", location)).toBe(true);
    expect(isSameOrigin("http://localhost:5173/a", location)).toBe(true);
    expect(isSameOrigin("ws://localhost:5173/?token=1", location)).toBe(true);
    expect(isSameOrigin("blob:http://localhost:5173/uuid", location)).toBe(true);
  });
  it("rejects other origins", () => {
    expect(isSameOrigin("https://odml.pa.googleapis.com/v1/log", location)).toBe(false);
    expect(isSameOrigin("https://cdn.jsdelivr.net/npm/x", location)).toBe(false);
    expect(isSameOrigin("http://localhost:8080/", location)).toBe(false);
    expect(isSameOrigin("wss://evil.example/", location)).toBe(false);
  });
});

describe("installNetworkGuard", () => {
  it("blocks the MediaPipe usage logger and other cross-origin requests on every API", async () => {
    const { win, calls } = fakeWindow();
    const guard = installNetworkGuard(win);
    const seen: string[] = [];
    guard.onBlocked((r) => seen.push(r.api));

    await expect(win.fetch("https://odml.pa.googleapis.com/v1/log", { method: "POST" })).rejects.toThrow(/network guard/);
    expect(() => new win.XMLHttpRequest().open("GET", "https://example.com/")).toThrow(/network guard/);
    expect(() => new win.WebSocket("wss://example.com/")).toThrow(/network guard/);
    expect(win.navigator.sendBeacon!("https://example.com/b")).toBe(false);

    expect(seen).toEqual(["fetch", "xhr", "websocket", "beacon"]);
    expect(guard.blocked.map((b) => b.url)).toContain("https://odml.pa.googleapis.com/v1/log");
    expect(calls).toEqual([]); // nothing reached the real APIs
  });

  // D-017: every known MediaPipe telemetry endpoint (web logger, Python/iOS clearcut uploader,
  // Android datatransport CCT backend) is cross-origin, so the CSP and this guard block it.
  const TELEMETRY_URLS = [
    "https://odml.pa.googleapis.com/v1/log",
    "https://play.googleapis.com/log",
    "https://play.googleapis.com/log?format=json&hasfast=true",
    "https://firebaselogging.googleapis.com/v0cc/log/batch?format=json_proto3",
    "https://firebaselogging-pa.googleapis.com/v1/firelog/legacy/batchlog",
  ];

  it.each(TELEMETRY_URLS)("isSameOrigin rejects telemetry endpoint %s", (url) => {
    expect(isSameOrigin(url, location)).toBe(false);
  });

  it.each(TELEMETRY_URLS)("blocks telemetry endpoint %s on fetch, xhr and beacon", async (url) => {
    const { win, calls } = fakeWindow();
    const guard = installNetworkGuard(win);
    await expect(win.fetch(url, { method: "POST" })).rejects.toThrow(/network guard/);
    expect(() => new win.XMLHttpRequest().open("POST", url)).toThrow(/network guard/);
    expect(win.navigator.sendBeacon!(url)).toBe(false);
    expect(guard.blocked.map((b) => b.url)).toEqual([url, url, url]);
    expect(calls).toEqual([]);
    guard.uninstall();
  });

  it("lets same-origin requests through and uninstalls cleanly", async () => {
    const { win, calls } = fakeWindow();
    const origFetch = win.fetch;
    const guard = installNetworkGuard(win);
    await win.fetch("/models/holistic_landmarker.task");
    new win.XMLHttpRequest().open("GET", "/x");
    new win.WebSocket("ws://localhost:5173/");
    expect(calls).toEqual(["fetch /models/holistic_landmarker.task", "xhr /x", "ws ws://localhost:5173/"]);
    guard.uninstall();
    expect(win.fetch).toBe(origFetch);
  });
});
