import { Logo } from "@/components/Logo";
import { SignCard } from "@/components/SignCard";
import { TextCard } from "@/components/TextCard";

export function App() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo className="h-8 w-auto" />
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">Research demo</span>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-8">
        <section className="py-12 sm:py-20">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Sign it. Read it. <span className="text-primary">Hear it.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">Your signing is recognised right on your device, turned into a plain sentence, and spoken aloud.</p>
        </section>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <SignCard />
          <TextCard />
        </div>
      </main>
      <footer className="mx-auto mt-16 max-w-6xl space-y-2 border-t border-border px-4 py-8 text-sm text-muted-foreground sm:px-8">
        <p>Your video never leaves your device. Only the recognised words are sent to our own server to write the sentence and generate speech.</p>
        <p>
          Research demo. The sign model was trained on German Sign Language weather forecasts (PHOENIX-2014, non-commercial research use) and knows about
          1,200 signs, so everyday signing will mostly give wrong or no words.
        </p>
      </footer>
    </div>
  );
}
