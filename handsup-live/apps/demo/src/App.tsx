import { CounterApp } from "@/components/CounterApp";
import { SignerApp } from "@/components/signer/SignerApp";
import { useRoute } from "@/lib/route";
import { useSession } from "@/lib/useSession";

/** `/signer` is the phone flow, `/counter` the tablet view; `/` picks by screen width. */
function Mode({ route, go }: { route: "signer" | "counter"; go: (r: "signer" | "counter") => void }) {
  // One session per mode: it owns the camera elements, so switching modes starts a fresh one.
  const s = useSession();
  return route === "signer" ? <SignerApp s={s} onCounter={() => go("counter")} /> : <CounterApp s={s} onSigner={() => go("signer")} />;
}

export function App() {
  const [route, go] = useRoute();
  return <Mode key={route} route={route} go={go} />;
}
