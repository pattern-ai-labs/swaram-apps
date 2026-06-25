// AudioWorklet: captures mono mic audio at the context's sample rate,
// resamples to 24 kHz with linear interpolation, converts to PCM16, and
// posts ~100 ms Int16 chunks back to the main thread.
// Loaded from /worklets/recorder.js (plain JS so the bundler leaves it alone).
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._outRate = 24000;
    this._ratio = sampleRate / this._outRate; // input samples per output sample
    this._pos = 0; // fractional read position carried across blocks
    this._tail = new Float32Array(0); // leftover input samples
    this._buf = []; // accumulated Int16 output
    this._target = 2400; // ~100 ms at 24 kHz
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;

    // prepend the leftover tail from the previous block for clean continuity
    const data = new Float32Array(this._tail.length + ch.length);
    data.set(this._tail, 0);
    data.set(ch, this._tail.length);

    let pos = this._pos;
    while (pos + 1 < data.length) {
      const i = pos | 0;
      const frac = pos - i;
      const s = data[i] * (1 - frac) + data[i + 1] * frac;
      const v = s < -1 ? -1 : s > 1 ? 1 : s;
      this._buf.push((v * 32767) | 0);
      pos += this._ratio;
    }

    const consumed = pos | 0;
    this._tail = data.slice(consumed);
    this._pos = pos - consumed;

    if (this._buf.length >= this._target) {
      const arr = Int16Array.from(this._buf);
      this._buf.length = 0;
      this.port.postMessage(arr.buffer, [arr.buffer]);
    }
    return true;
  }
}

registerProcessor("recorder-processor", RecorderProcessor);
