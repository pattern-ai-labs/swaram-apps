/**
 * Audio glue for the Plivo <-> swaram bridge.
 *
 * Plivo streams the phone leg as 8 kHz G.711 μ-law (one byte per sample, base64).
 * swaram speaks PCM16 (little-endian) at 24 kHz, base64 — both directions. So the
 * bridge has to transcode + resample by a clean 1:3 ratio each way:
 *
 *   caller  -> Plivo μ-law 8k -> [decode + upsample x3] -> PCM16 24k -> swaram
 *   swaram  -> PCM16 24k      -> [downsample /3 + encode] -> μ-law 8k -> Plivo -> caller
 *
 * μ-law is a single byte so it has no endianness; PCM16 is written/read little-endian
 * to match swaram (OpenAI-realtime convention).
 */

// ---- G.711 μ-law codec (ITU-T G.711) ----

const BIAS = 0x84;
const CLIP = 32635;

/** One μ-law byte -> one Int16 PCM sample. */
export function muLawDecodeSample(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  return sign ? -sample : sample;
}

/** One Int16 PCM sample -> one μ-law byte. */
export function muLawEncodeSample(sample: number): number {
  let sign = 0;
  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {
    /* find exponent */
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

// ---- caller -> swaram : μ-law 8k (base64) -> PCM16 24k (base64) ----

/**
 * Decode a base64 μ-law 8 kHz chunk and linearly upsample x3 to PCM16 24 kHz.
 * Linear interpolation is plenty for band-limited telephone speech.
 */
export function mulaw8kToPcm24k(b64: string): string {
  const mu = Buffer.from(b64, "base64");
  const n = mu.length;
  if (n === 0) return "";

  const pcm8 = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm8[i] = muLawDecodeSample(mu[i]);

  const out = Buffer.allocUnsafe(n * 3 * 2); // 3 samples out per sample in, 2 bytes each
  let o = 0;
  for (let i = 0; i < n; i++) {
    const a = pcm8[i];
    const b = i + 1 < n ? pcm8[i + 1] : a;
    const step = (b - a) / 3;
    out.writeInt16LE(a, o); o += 2;
    out.writeInt16LE((a + step) | 0, o); o += 2;
    out.writeInt16LE((a + 2 * step) | 0, o); o += 2;
  }
  return out.toString("base64");
}

// ---- swaram -> caller : PCM16 24k (base64) -> μ-law 8k (base64) ----

/**
 * Stateful 24k->8k downsampler + μ-law encoder. swaram sends audio in variable-size
 * deltas that don't align to the 1:3 decimation boundary, so we carry the (<3) leftover
 * samples between calls to avoid clicks/drift over a long reply.
 *
 * Downsampling averages each group of 3 samples (a cheap box low-pass) before decimating,
 * which keeps the 8 kHz output free of the worst aliasing.
 */
export class Pcm24kToMulaw8k {
  private carry: number[] = [];

  /** Push one base64 PCM16-24k delta; returns base64 μ-law-8k (may be "" if nothing ready). */
  push(b64: string): string {
    const pcm = Buffer.from(b64, "base64");
    const m = pcm.length >> 1;
    const samples = this.carry;
    for (let i = 0; i < m; i++) samples.push(pcm.readInt16LE(i * 2));

    const groups = Math.floor(samples.length / 3);
    if (groups === 0) return "";

    const out = Buffer.allocUnsafe(groups);
    for (let g = 0; g < groups; g++) {
      const avg = (samples[3 * g] + samples[3 * g + 1] + samples[3 * g + 2]) / 3;
      out[g] = muLawEncodeSample(avg | 0);
    }
    this.carry = samples.slice(groups * 3);
    return out.toString("base64");
  }

  reset(): void {
    this.carry = [];
  }
}
