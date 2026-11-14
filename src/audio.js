/** All sound is synthesised with WebAudio — no asset files. */
export class Sfx {
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // ambient wind
    const src = this.ctx.createBufferSource();
    src.buffer = this.buf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = this.ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(); lfo.start();
  }
  noise(dur, freq, gain, type = 'bandpass', sweep = 0, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  tone(freq, dur, type = 'sine', gain = 0.2, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  swing() { this.noise(0.22, 700, 0.35, 'bandpass', 2800, 1.5); }
  hit() { this.noise(0.14, 420, 0.7, 'lowpass'); this.tone(120, 0.14, 'square', 0.16, 55); }
  fire() { this.noise(0.35, 1400, 0.35, 'bandpass', 300); this.tone(320, 0.3, 'sawtooth', 0.08, 90); }
  boom() { this.noise(0.6, 500, 0.9, 'lowpass', 60); this.tone(90, 0.5, 'sine', 0.4, 35); }
  frost() { this.noise(0.7, 5000, 0.3, 'highpass', 1500); this.tone(1200, 0.6, 'triangle', 0.12, 300); }
  heal() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.14, 0, i * 0.09)); }
  hurt() { this.noise(0.2, 250, 0.7, 'lowpass'); this.tone(180, 0.25, 'sawtooth', 0.2, 70); }
  eat() { this.noise(0.09, 900, 0.3, 'bandpass'); setTimeout(() => this.noise(0.09, 700, 0.3, 'bandpass'), 140); }
  pickup() { this.tone(880, 0.12, 'sine', 0.12, 1320); }
  growl(size = 1) { this.tone(95 / size, 0.55, 'sawtooth', 0.14, 50 / size); this.noise(0.5, 220, 0.2, 'lowpass'); }
  slam() { this.noise(0.5, 180, 1, 'lowpass', 40); this.tone(60, 0.5, 'sine', 0.5, 28); }
  dodge() { this.noise(0.25, 500, 0.25, 'bandpass', 1600); }
  deny() { this.tone(160, 0.12, 'square', 0.08); }
  step() { this.noise(0.07, 180 + Math.random() * 80, 0.16, 'lowpass'); }
  level() { [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.14, 0, i * 0.08)); }
  die() { this.tone(220, 1.6, 'sawtooth', 0.25, 40); }
}
