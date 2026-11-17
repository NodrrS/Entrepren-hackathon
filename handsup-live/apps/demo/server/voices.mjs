// Fixed voices for the public demo. The browser can only choose "en" or "de", never a voice name,
// so nobody can reach the cloned voices on the Voice Control service.
// Chosen 2026-11-17 by timing on a short weather sentence (about 1.2 s each, all four tested voices were
// transcribed back word for word in both languages): Ryan for English, Aiden for German.
export const VOICES = {
  en: { voice: "Ryan", language: "English" },
  de: { voice: "Aiden", language: "German" },
};

export const MAX_TEXT_CHARS = 400;
