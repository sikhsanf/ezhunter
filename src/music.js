// Celtic-style soundtrack, composed and synthesised in code (no audio files).
//
// Five original tunes — a title air, one theme per map, and a battle reel — each written as melody lines in
// scale degrees with a chord per bar, then arranged for a small "band": tin whistle, fiddle, harp, string pad,
// pipes drone, bass, bodhrán and bells, all sent through a generated hall reverb.
//
// Melody notation, one string per bar:  a number = scale degree (0 = tonic, 7 = octave above),
//                                       "-" = hold the previous note,  "." = rest.

const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------ the tunes
const TUNES = {
  // Title: "Ashen Wilds" — slow air in D Dorian, 3/4
  title: {
    mode: 'dorian', root: 62, spb: 6, step: 0.36, form: ['A', 'B'],
    A: { mel: ['0 - - - 2 3', '4 - - - 3 2', '3 - 2 - 0 -', '1 - - - - .', '4 - - - 6 7', '9 - 8 - 7 -', '6 - 4 - 3 2', '0 - - - - .'], ch: [0, 2, 3, 6, 2, 0, 6, 0] },
    B: { mel: ['7 - - 9 8 7', '6 - - - 4 -', '5 - 4 - 2 3', '4 - - - - .', '7 - - 9 8 7', '11 - 9 - 8 7', '6 - 4 3 2 1', '0 - - - - .'], ch: [0, 6, 3, 4, 0, 2, 6, 0] },
    arr(e) {
      const { t, inBar, bar, chord: c, note, sd, loop, sec, I, N } = e;
      if (inBar === 0) {
        I.pad(t, [N(c - 7), N(c - 3), N(c), N(c + 2)], sd * 6.4, 0.05);
        I.bass(t, N(c - 14), sd * 5, 0.2);
        if (bar % 2 === 0) I.drone(t, N(-14), sd * 12.5, 0.03);
      }
      I.harp(t, N([c - 7, c - 3, c, c + 2, c + 4, c + 2][inBar]), inBar === 0 ? 0.2 : 0.13);
      if (sec === 1 && inBar === 3) I.harp(t + sd * 0.5, N(c + 7), 0.07); // little answering sparkle in the B part
      if (note) {
        I.whistle(t, N(note.deg + 7), note.len * sd, 0.2, note.len >= 3 ? N(note.deg + 8) : 0);
        if (loop > 0 || sec === 1) I.fiddle(t, N(note.deg - 2), note.len * sd, 0.06); // harmony a third below
      }
      if (loop > 0 && inBar === 0) I.drum(t, 0.25, 70);
    },
  },

  // Verdant Vale: "The Mossback's Jig" — bright double jig in D major, 6/8
  vale: {
    mode: 'major', root: 62, spb: 6, step: 0.172, swing: [1.14, 0.86, 1.0], form: ['A', 'A', 'B', 'B'],
    A: { mel: ['4 2 0 0 2 4', '5 4 2 4 - 2', '3 2 3 4 2 0', '1 2 1 1 - .', '4 2 0 0 2 4', '5 4 2 4 - 7', '8 7 5 4 2 4', '0 - 0 0 - .'], ch: [0, 0, 3, 4, 0, 5, 4, 0] },
    B: { mel: ['7 - 7 7 8 9', '8 7 5 4 - 5', '7 - 9 8 7 5', '4 5 4 1 - .', '7 - 7 7 8 9', '11 9 7 8 7 5', '4 5 7 4 2 1', '0 - 0 0 - .'], ch: [0, 5, 3, 4, 0, 3, 4, 0] },
    arr(e) {
      const { t, inBar, chord: c, note, sd, loop, sec, I, N } = e;
      const full = loop > 0 || sec >= 1; // the band comes in after the first time through
      if (inBar === 0) { I.pad(t, [N(c - 7), N(c - 3), N(c)], sd * 6.2, 0.035); I.bass(t, N(c - 14), sd * 2.6, 0.24); }
      if (inBar === 3) I.bass(t, N(c - 10), sd * 2.4, 0.18);
      I.harp(t, N([c - 7, c, c + 2, c - 3, c, c + 4][inBar]), inBar % 3 === 0 ? 0.16 : 0.1);
      if (note) {
        const beat = inBar % 3 === 0;
        I.whistle(t, N(note.deg + 7), note.len * sd * 0.95, beat ? 0.2 : 0.16, beat && note.len >= 2 ? N(note.deg + 8) : 0);
        if (sec % 2 === 1 || loop > 0) I.fiddle(t, N(note.deg), note.len * sd * 0.95, 0.07);
      }
      if (full) {
        const pat = [0.5, 0, 0.2, 0.36, 0.14, 0.24][inBar];
        if (pat) I.drum(t, pat, inBar === 0 ? 82 : 96);
        if (inBar === 2 || inBar === 5) I.tick(t, 0.08);
      }
    },
  },

  // Frostfang Tundra: "Snow on the Standing Stones" — sparse air in A minor, 3/4
  tundra: {
    mode: 'aeolian', root: 69, spb: 6, step: 0.4, form: ['A', 'B'],
    A: { mel: ['4 - - - . .', '7 - 6 - 4 -', '5 - - 4 2 -', '1 - - - . .', '4 - - - 7 -', '9 - 8 - 7 -', '6 - 4 - 2 1', '0 - - - . .'], ch: [0, 0, 5, 4, 0, 2, 6, 0] },
    B: { mel: ['2 - - 4 7 -', '8 - 7 - 4 -', '5 - 4 - 2 -', '4 - - - . .', '7 - - 9 11 -', '10 - 9 - 7 -', '6 - 4 2 1 -', '0 - - - . .'], ch: [2, 4, 5, 4, 0, 3, 6, 0] },
    arr(e) {
      const { t, inBar, bar, chord: c, note, sd, loop, I, N } = e;
      if (inBar === 0) {
        I.pad(t, [N(c - 14), N(c - 7), N(c - 3), N(c + 2 - 7)], sd * 6.6, 0.055);
        if (bar % 2 === 0) I.wind(t, sd * 12, 0.05);
        if (bar % 4 === 0) I.bass(t, N(c - 21), sd * 6, 0.16);
      }
      if (inBar % 2 === 0) I.harp(t, N([c - 7, 0, c, 0, c + 2][inBar]), 0.12);
      if ((inBar === 3 || inBar === 5) && (bar + inBar) % 3 !== 0) I.bell(t, N(c + [7, 9, 11][(bar + inBar) % 3]), 0.05); // ice chimes
      if (note) {
        I.whistle(t, N(note.deg), note.len * sd, 0.15, note.len >= 4 ? N(note.deg + 1) : 0, 0.9);
        if (loop > 0) I.fiddle(t, N(note.deg - 7 - 2), note.len * sd, 0.045);
      }
    },
  },

  // Cinder Wastes: "The Ash Road" — slow, heavy march in D Phrygian, 4/4
  wastes: {
    mode: 'phrygian', root: 50, spb: 8, step: 0.34, form: ['A', 'A'],
    A: { mel: ['0 - - 1 0 - - -', '3 - 1 - 0 - - .', '4 - - 5 4 - 3 -', '1 - - - 0 - - .', '7 - - 8 7 - 5 -', '4 - 3 - 1 - 0 -', '3 - 4 - 5 - 4 3', '0 - - - - - . .'], ch: [0, 1, 0, 1, 0, 3, 5, 0] },
    arr(e) {
      const { t, inBar, bar, chord: c, note, sd, loop, sec, I, N } = e;
      if (inBar === 0) {
        I.pad(t, [N(c), N(c + 2), N(c + 4), N(c + 7)], sd * 8.4, 0.04);
        I.bass(t, N(c - 7), sd * 6, 0.3);
        if (bar % 2 === 0) I.drone(t, N(-7), sd * 16.5, 0.045);
      }
      const d = [0.75, 0, 0, 0.3, 0.6, 0, 0.26, 0.16][inBar];
      if (d) I.drum(t, d, inBar === 0 ? 52 : 62);
      if (inBar === 4 && bar % 2 === 1) I.bell(t, N(c + 7), 0.05, 0.4); // a far-off anvil
      if (inBar % 2 === 0 && (sec === 1 || loop > 0)) I.harp(t, N([c, 0, c + 4, 0, c + 2, 0, c + 4][inBar]), 0.09);
      if (note) {
        I.fiddle(t, N(note.deg + 7), note.len * sd, 0.17);
        if (sec === 1 || loop > 0) I.whistle(t, N(note.deg + 14), note.len * sd, 0.07, 0, 0.6); // ghostly octave
      }
    },
  },

  // Battle: "Fang and Flame" — driving reel in E Dorian, 4/4
  battle: {
    mode: 'dorian', root: 64, spb: 8, step: 0.196, form: ['A', 'A', 'B', 'B'],
    A: { mel: ['0 - 4 0 6 0 4 0', '0 - 4 0 3 1 -1 1', '0 - 4 0 6 0 4 0', '7 6 4 6 3 1 -1 1', '0 - 4 0 6 0 4 0', '0 - 4 0 3 1 -1 1', '2 - 4 2 6 2 4 2', '3 1 -1 1 0 - 0 -'],
      ch: [0, 0, 0, 6, 0, 0, 0, 6, 0, 0, 0, 6, 2, 2, 6, 0] },
    B: { mel: ['7 - 9 7 11 7 9 7', '8 - 10 8 6 8 10 8', '7 - 9 7 11 7 9 7', '11 10 9 8 7 6 4 6', '7 - 9 7 11 7 9 7', '8 - 10 8 6 8 10 8', '9 11 9 7 8 10 8 6', '7 4 6 4 0 - 0 -'],
      ch: [0, 0, 6, 6, 0, 0, 0, 6, 0, 0, 6, 6, 2, 6, 0, 0] },
    arr(e) {
      const { t, inBar, bar, chord: c, note, sd, I, N } = e;
      if (inBar === 0 || inBar === 4) { I.pad(t, [N(c - 7), N(c - 3), N(c)], sd * 4.2, 0.04); I.bass(t, N(c - 14), sd * 1.8, 0.32); I.drum(t, 0.8, 54); }
      if (inBar === 6) I.bass(t, N(c - 10), sd * 1.6, 0.22);
      if (inBar === 0 && bar % 2 === 0) I.drone(t, N(-14), sd * 16.4, 0.03);
      if (inBar === 0 || inBar === 3 || inBar === 6) [c - 7, c - 3, c].forEach((dg, i) => I.harp(t + i * 0.012, N(dg), 0.11)); // 3-3-2 strum
      I.drum(t, [0.5, 0.14, 0.3, 0.2, 0.45, 0.14, 0.32, 0.24][inBar], 92);
      if (inBar % 2 === 1) I.tick(t, 0.07);
      if (note) {
        const acc = inBar % 4 === 0;
        I.fiddle(t, N(note.deg + 7), note.len * sd * 0.92, acc ? 0.17 : 0.13);
        I.whistle(t, N(note.deg + 7), note.len * sd * 0.9, acc ? 0.13 : 0.1, acc && note.len >= 2 ? N(note.deg + 8) : 0, 0.4);
      }
    },
  },
};

/** Flatten a tune's form into absolute steps: which note starts on each step, and the chord there. */
function compile(tune) {
  const scale = MODES[tune.mode], notes = new Map(), chords = [];
  let off = 0;
  tune.form.forEach((name, sec) => {
    const part = tune[name], toks = part.mel.join(' ').trim().split(/\s+/);
    let cur = null;
    toks.forEach((tok, i) => {
      if (tok === '-') { if (cur) cur.len++; }
      else if (tok === '.') cur = null;
      else { cur = { deg: +tok, len: 1 }; notes.set(off + i, cur); }
    });
    const per = toks.length / part.ch.length; // steps per chord (a bar, or half a bar)
    for (let i = 0; i < toks.length; i++) chords[off + i] = { c: part.ch[Math.floor(i / per)], sec };
    off += toks.length;
  });
  tune.len = off; tune.notes = notes; tune.chords = chords;
  tune.N = (deg) => hz(tune.root + 12 * Math.floor(deg / 7) + scale[((deg % 7) + 7) % 7]);
}
for (const k in TUNES) compile(TUNES[k]);

// ------------------------------------------------------------------ the band
export class Music {
  constructor() { this.cur = null; this.want = null; this.vol = 0.7; this.muted = false; }

  init(ctx) {
    if (this.ctx || !ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : this.vol;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.out.connect(comp); comp.connect(ctx.destination);
    // hall reverb from a generated impulse: decaying noise, darker towards the tail
    const len = Math.floor(ctx.sampleRate * 3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len, k = 0.25 + 0.7 * (1 - x); // one-pole low-pass that closes over time
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - x, 2.6) * (i < 400 ? i / 400 : 1);
      }
    }
    this.rev = ctx.createConvolver(); this.rev.buffer = ir;
    const rg = ctx.createGain(); rg.gain.value = 0.9; this.rev.connect(rg); rg.connect(this.out);
    const nl = ctx.sampleRate * 2; this.noise = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = this.noise.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    setInterval(() => this.tick(), 50);
    if (this.want) { const w = this.want; this.want = null; this.play(w); }
  }
  /** True once sound is actually coming out (the browser has allowed audio and a tune is running). */
  get playing() { return !!(this.ctx && this.ctx.state === 'running' && this.cur && !this.muted); }
  setMuted(m) { this.muted = m; if (this.out) this.out.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.15); }

  /** Cross-fade to a tune by name (no-op if it is already playing). */
  play(name, fadeIn = 1.2, fadeOut = 2) {
    if (this.want === name) return;
    this.want = name;
    if (!this.ctx || !TUNES[name]) return;
    const ctx = this.ctx, now = ctx.currentTime, old = this.cur;
    // every tune has two faders that move together: its direct sound and its reverb send
    const fader = (dest) => { const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + fadeIn); g.connect(dest); return g; };
    if (old) {
      for (const g of [old.dry, old.rin]) { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + fadeOut); }
      setTimeout(() => { try { old.dry.disconnect(); old.rin.disconnect(); } catch { /* already gone */ } }, (fadeOut + 4) * 1000);
    }
    const tr = { tune: TUNES[name], dry: fader(this.out), rin: fader(this.rev), step: 0, loop: 0, next: now + 0.1 };
    tr.I = this.band(tr);
    this.cur = tr;
  }

  /** Schedule the next few steps of the current tune a little ahead of the audio clock. */
  tick() {
    const tr = this.cur, ctx = this.ctx;
    if (!tr || ctx.state !== 'running' || document.hidden) { if (tr) tr.next = Math.max(tr.next, ctx.currentTime + 0.1); return; }
    if (tr.next < ctx.currentTime) tr.next = ctx.currentTime + 0.05; // fell behind (tab was asleep): skip, don't burst
    const tune = tr.tune;
    while (tr.next < ctx.currentTime + 0.3) {
      const s = tr.step, inBar = s % tune.spb, ch = tune.chords[s];
      tune.arr({ t: tr.next, s, inBar, bar: Math.floor(s / tune.spb), chord: ch.c, sec: ch.sec, note: tune.notes.get(s), sd: tune.step, loop: tr.loop, I: tr.I, N: tune.N });
      tr.next += tune.step * (tune.swing ? tune.swing[inBar % tune.swing.length] : 1);
      if (++tr.step >= tune.len) { tr.step = 0; tr.loop++; }
    }
  }

  /** The instruments, bound to one tune's output so a cross-fade carries everything it is playing. */
  band(tr) {
    const ctx = this.ctx, noise = this.noise;
    const osc = (type, f, t, stop, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune; o.start(t); o.stop(stop); return o; };
    const out = (node, rev) => { node.connect(tr.dry); if (rev) { const s = ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(tr.rin); } };
    const env = (t, a, hold, r, peak) => { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + Math.max(a, hold)); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, hold) + r); return g; };
    const vib = (target, t, f, rate, depth, delay, end) => { const l = osc('sine', rate, t, end), g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(f * depth, t + delay + 0.25); l.connect(g); g.connect(target.frequency); return l; };
    const nsrc = (t, dur) => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, Math.random() * 1.5); s.stop(t + dur); return s; };
    return {
      /** Plucked harp: bright attack, long ring. */
      harp(t, f, vel) {
        vel *= 1.9;
        const end = t + 2.2, g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.006); g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, end);
        const a = osc('triangle', f, t, end), b = osc('sine', f * 2, t, end, 3), c = osc('sine', f * 3, t, end), gb = ctx.createGain(), gc = ctx.createGain();
        gb.gain.value = 0.32; gc.gain.setValueAtTime(0.16, t); gc.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        a.connect(g); b.connect(gb); gb.connect(g); c.connect(gc); gc.connect(g);
        out(g, 0.45);
      },
      /** Tin whistle: pure tone, breath, late vibrato, optional "cut" grace note at the start. */
      whistle(t, f, dur, vel, cut = 0, rev = 0.5) {
        vel *= 2.3;
        const end = t + dur + 0.12, g = env(t, 0.035, dur, 0.1, vel);
        const a = osc('sine', f, t, end), b = osc('sine', f * 2, t, end), c = osc('triangle', f * 3, t, end), gb = ctx.createGain(), gc = ctx.createGain();
        gb.gain.value = 0.2; gc.gain.value = 0.05;
        if (cut) for (const [o, m] of [[a, 1], [b, 2], [c, 3]]) { o.frequency.setValueAtTime(cut * m, t); o.frequency.setValueAtTime(f * m, t + 0.04); }
        if (dur > 0.3) vib(a, t, f, 5.2, 0.006, 0.15, end);
        a.connect(g); b.connect(gb); gb.connect(g); c.connect(gc); gc.connect(g);
        const n = nsrc(t, dur + 0.1), bp = ctx.createBiquadFilter(), gn = ctx.createGain();
        bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 1.5; gn.gain.value = 0.35;
        n.connect(bp); bp.connect(gn); gn.connect(g);
        out(g, rev);
      },
      /** Fiddle: two slightly detuned saws through a body filter, with vibrato. */
      fiddle(t, f, dur, vel) {
        vel *= 2.0;
        const end = t + dur + 0.16, g = env(t, 0.05, dur, 0.14, vel);
        const a = osc('sawtooth', f, t, end, -4), b = osc('sawtooth', f, t, end, 5);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(5200, 1400 + f * 2.2); lp.Q.value = 0.8;
        const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1100; pk.Q.value = 1.2; pk.gain.value = 5;
        if (dur > 0.28) { vib(a, t, f, 5.8, 0.005, 0.12, end); vib(b, t, f, 5.8, 0.005, 0.12, end); }
        a.connect(lp); b.connect(lp); lp.connect(pk); pk.connect(g);
        out(g, 0.4);
      },
      /** Slow string pad holding the chord. */
      pad(t, freqs, dur, vel) {
        const end = t + dur + 1.0, g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + Math.min(0.7, dur * 0.4)); g.gain.setValueAtTime(vel, t + dur); g.gain.linearRampToValueAtTime(0.0001, end);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.5;
        for (const f of freqs) { osc('sawtooth', f, t, end, -7).connect(lp); osc('sawtooth', f, t, end, 7).connect(lp); }
        lp.connect(g); out(g, 0.6);
      },
      /** Pipes drone: root and fifth, nasal. */
      drone(t, f, dur, vel) {
        const end = t + dur + 0.8, g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.8); g.gain.setValueAtTime(vel, t + dur); g.gain.linearRampToValueAtTime(0.0001, end);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 0.9;
        osc('sawtooth', f, t, end).connect(bp); osc('sawtooth', f * 1.5, t, end, 4).connect(bp); osc('square', f * 2, t, end, -3).connect(bp);
        bp.connect(g); out(g, 0.35);
      },
      bass(t, f, dur, vel) {
        vel *= 0.8;
        const end = t + dur + 0.2, g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.012); g.gain.exponentialRampToValueAtTime(vel * 0.5, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, end);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        osc('triangle', f, t, end).connect(lp); osc('sine', f * 2, t, end).connect(lp);
        lp.connect(g); out(g, 0.12);
      },
      /** Bodhrán / war drum: a pitched skin thump plus the tap of the beater. */
      drum(t, vel, pitch = 90) {
        vel *= 1.4;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(pitch * 2.3, t); o.frequency.exponentialRampToValueAtTime(pitch, t + 0.05);
        g.gain.setValueAtTime(vel * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        o.connect(g); o.start(t); o.stop(t + 0.3);
        const n = nsrc(t, 0.05), lp = ctx.createBiquadFilter(), gn = ctx.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 1300; gn.gain.setValueAtTime(vel * 0.22, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
        n.connect(lp); lp.connect(gn); gn.connect(g);
        out(g, 0.18);
      },
      tick(t, vel) {
        const n = nsrc(t, 0.05), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 2.5; g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        n.connect(bp); bp.connect(g); out(g, 0.15);
      },
      /** Bell / chime: inharmonic partials, long shimmer. */
      bell(t, f, vel, shift = 1) {
        vel *= 1.8;
        const end = t + 3, g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, end);
        [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([m, a]) => { const pg = ctx.createGain(); pg.gain.value = a; osc('sine', f * m * shift, t, end).connect(pg); pg.connect(g); });
        out(g, 0.8);
      },
      /** A long breath of wind. */
      wind(t, dur, vel) {
        const n = nsrc(t, dur + 0.5), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(380, t); bp.frequency.linearRampToValueAtTime(820, t + dur * 0.5); bp.frequency.linearRampToValueAtTime(420, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + dur * 0.45); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
        n.connect(bp); bp.connect(g); out(g, 0.5);
      },
    };
  }
}
export const TUNE_NAMES = Object.keys(TUNES);
export { TUNES };
