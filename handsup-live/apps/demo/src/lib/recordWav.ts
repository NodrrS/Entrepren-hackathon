/**
 * Records the microphone and returns a 16 kHz mono 16-bit WAV, encoded in the page. WAV works for the speech
 * service in every browser (Chrome, Firefox, Safari on iPhone), unlike MediaRecorder formats.
 */
export const TARGET_RATE = 16000;

/** Averages samples down to `TARGET_RATE` (a cheap low-pass, good enough for speech). */
export function downsample(input: Float32Array, inRate: number): Float32Array {
  if (inRate <= TARGET_RATE) return input;
  const ratio = inRate / TARGET_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j]!;
    out[i] = sum / Math.max(1, to - from);
  }
  return out;
}

/** 16-bit PCM mono WAV file bytes. */
export function encodeWav(samples: Float32Array, rate = TARGET_RATE): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

export interface Recording {
  /** Stops and returns the WAV and its length in seconds. */
  stop(): Promise<{ wav: Blob; seconds: number }>;
  cancel(): void;
}

/** Starts recording. Call it straight from the press handler: iPhone only allows audio after a tap. */
export async function startRecording(): Promise<Recording> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx(); // created before any await, inside the user's tap
  void ctx.resume();
  let media: MediaStream;
  try {
    media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    void ctx.close();
    throw e;
  }
  const source = ctx.createMediaStreamSource(media);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  proc.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
  const mute = ctx.createGain();
  mute.gain.value = 0; // the processor must be connected to run, but nothing should be played back
  source.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
  const release = () => { proc.disconnect(); source.disconnect(); media.getTracks().forEach((t) => t.stop()); void ctx.close(); };
  return {
    cancel: release,
    async stop() {
      const rate = ctx.sampleRate;
      release();
      const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
      let o = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      return { wav: new Blob([encodeWav(downsample(all, rate))], { type: "audio/wav" }), seconds: all.length / rate };
    },
  };
}
