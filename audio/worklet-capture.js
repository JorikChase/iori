/* Audio Tools — capture processor (AudioWorklet), loaded by AT.worklet(ctx) in shared.js.
   Runs on the audio thread in 128-frame quanta and forwards its input to the main thread in batches:
     port message {f, n, ch, pk}
       f   frame index (currentFrame) of the batch's first sample — the exact audio-clock position
       n   frames in the batch
       ch  [Float32Array(n) per channel], transferred
       pk  peak |x| of channel 0
   processorOptions: {channels: 1, batch: 1024}. Create the node with channelCount = channels and
   channelCountMode 'explicit' (and 'discrete' to keep a merger's channels apart).
   The output stays silent; connect it to the destination through a zero gain anyway (Safari only runs nodes that
   reach the destination). A quantum with no active input is forwarded as silence, so frames never skip.
   port.postMessage('stop') ends the processor. */
class Capture extends AudioWorkletProcessor {
  constructor(o) {
    super();
    const p = (o && o.processorOptions) || {};
    this.c = Math.max(1, p.channels | 0 || 1); this.B = Math.max(128, p.batch | 0 || 1024); this.done = false;
    this.fresh();
    this.port.onmessage = (e) => { if (e.data === 'stop') { this.done = true; this.n = 0; } };
  }
  fresh() { this.buf = []; for (let c = 0; c < this.c; c++) this.buf.push(new Float32Array(this.B)); this.n = 0; this.pk = 0; }
  send() {
    const ch = this.buf;
    this.port.postMessage({ f: this.f0, n: this.n, ch: ch, pk: this.pk }, ch.map((b) => b.buffer));
    this.fresh();
  }
  process(inputs, outputs) {
    if (this.done) return false;
    const inp = inputs[0] || [], o = outputs[0] && outputs[0][0], q = inp[0] ? inp[0].length : o ? o.length : 128;
    if (!this.n) this.f0 = currentFrame;
    let at = 0;
    while (at < q) {
      const k = Math.min(q - at, this.B - this.n);
      for (let c = 0; c < this.c; c++) {
        const x = inp[c] || inp[0];   // fewer input channels than asked: repeat the first
        if (x) this.buf[c].set(x.subarray(at, at + k), this.n);   // no input: the fresh buffer is already zeros
      }
      const x0 = inp[0];
      if (x0) { let pk = this.pk; for (let i = at; i < at + k; i++) { const a = x0[i] < 0 ? -x0[i] : x0[i]; if (a > pk) pk = a; } this.pk = pk; }
      this.n += k; at += k;
      if (this.n === this.B) { this.send(); if (at < q) this.f0 = currentFrame + at; }
    }
    return true;
  }
}
registerProcessor('capture', Capture);
