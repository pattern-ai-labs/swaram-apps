function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/**
 * Plays a stream of base64 PCM16 @ 24 kHz deltas back-to-back, in order.
 * flush() stops everything immediately (used for barge-in).
 */
export class PcmPlayer {
  private ctx: AudioContext;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 24000 });
  }

  /** Resume the context inside a user gesture (autoplay policy). */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** Current AudioContext state (for diagnostics). */
  state(): string {
    return this.ctx.state;
  }

  /** Milliseconds of audio still queued/playing (so we can wait it out). */
  remainingMs(): number {
    return Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000);
  }

  enqueue(b64: string): void {
    const pcm = base64ToInt16(b64);
    if (pcm.length === 0) return;
    const buffer = this.ctx.createBuffer(1, pcm.length, 24000);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    const start = Math.max(now, this.nextTime);
    src.start(start);
    this.nextTime = start + buffer.duration;

    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** Stop all queued/playing audio immediately (barge-in). */
  flush(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.nextTime = this.ctx.currentTime;
  }

  async close(): Promise<void> {
    this.flush();
    await this.ctx.close().catch(() => {});
  }
}
