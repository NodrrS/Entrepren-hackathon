/**
 * Caption lines for /live: one line per utterance (a new line starts after a pause without hands,
 * or on Start/Stop). Glosses are only appended, never revised (the closure rule emits final
 * glosses). Pure state, rendered by main.ts with textContent only (no HTML injection).
 */
import type { GlossLabel } from "@handsup/fc10-runtime";

export interface CaptionLine {
  readonly glosses: GlossLabel[];
}

export class Captions {
  readonly lines: CaptionLine[] = [{ glosses: [] }];

  constructor(private readonly maxLines = 6) {}

  get current(): CaptionLine {
    return this.lines[this.lines.length - 1]!;
  }

  add(label: GlossLabel): boolean {
    if (label.hidden) return false;
    this.current.glosses.push(label);
    return true;
  }

  /** Start a new line (only if the current one has content). */
  newLine(): void {
    if (this.current.glosses.length === 0) return;
    this.lines.push({ glosses: [] });
    while (this.lines.length > this.maxLines) this.lines.shift();
  }

  clear(): void {
    this.lines.length = 0;
    this.lines.push({ glosses: [] });
  }
}

/** "WETTER MORGEN" */
export function germanText(line: CaptionLine): string {
  return line.glosses.map((g) => g.gloss).join(" ");
}

/** Rough English words, "?" for glosses without one. */
export function englishText(line: CaptionLine): string {
  return line.glosses.map((g) => g.english ?? "?").join(" · ");
}
