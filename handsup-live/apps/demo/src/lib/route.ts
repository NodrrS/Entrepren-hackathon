import { useCallback, useEffect, useState } from "react";

/** The two modes of the app: the signer's phone flow, and the counter (staff) view. */
export type Route = "signer" | "counter";

/** `/signer` and `/counter` are fixed; `/` picks by screen width (phones: signer, bigger screens: counter). */
export function pickRoute(pathname: string, width: number): Route {
  const p = pathname.replace(/\/+$/, "");
  if (p === "/signer") return "signer";
  if (p === "/counter") return "counter";
  return width < 768 ? "signer" : "counter";
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => pickRoute(location.pathname, innerWidth));
  useEffect(() => {
    const onPop = () => setRoute(pickRoute(location.pathname, innerWidth));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((r: Route) => {
    history.pushState(null, "", r === "signer" ? "/signer" : "/counter");
    setRoute(r);
  }, []);
  return [route, go];
}
