// Voices for the public demo. The browser can only choose a language ("en" | "de") and one of three voice styles
// by name ("default" | "c3po" | "snape"), never a voice id, so no other voice on the Voice Control service can
// be reached from the page.
// Default: chosen 2026-11-17 by timing on a short weather sentence (about 1.2 s each, all four tested voices were
// transcribed back word for word in both languages): Ryan for English, Aiden for German.
export const VOICES = {
  en: { voice: "Ryan", language: "English" },
  de: { voice: "Aiden", language: "German" },
};

// Character voices (cloned voices on the Voice Control service, addressed by id; display names do not work for
// cloned voices). Checked 2026-11-17: both speak English and German and were transcribed back word for word.
// They are slower than the default (about 2.5 s for Snape, up to 5.5 s for C-3PO on a first request).
export const VOICE_STYLES = {
  default: null,
  c3po: "voice-034233ea177a", // "3CPO"
  snape: "voice-1dbe708a4613", // "Snape"
};

export const MAX_TEXT_CHARS = 400;
