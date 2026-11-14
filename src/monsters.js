import * as THREE from 'three';
import { heightAt, WORLD_R } from './world.js';

/**
 * temper: passive   → never attacks, flees when you come close or hurt it
 *         neutral   → ignores you until struck, then fights
 *         aggressive→ hunts you on sight
 * effect: 'chill' slows the player, 'burn' deals damage over time.
 */
const T = (o) => o;
export const TYPES = {
  // ---------------- Verdant Vale ----------------
  grazer: T({ name: 'Mossback', look: 'grazer', temper: 'passive', hp: 45, speed: 2.2, flee: 8.6, fleeDist: 9, radius: 1.0, height: 1.8, meat: 2, essence: 4, mass: 0.3 }),
  hare: T({ name: 'Glimmerhare', look: 'hare', temper: 'passive', hp: 14, speed: 3, flee: 11.5, fleeDist: 13, radius: 0.5, height: 0.8, meat: 1, essence: 10, mass: 0 }),
  stonehorn: T({ name: 'Stonehorn', look: 'stonehorn', temper: 'neutral', hp: 120, speed: 1.8, chase: 7.5, aggro: 30, range: 9, windup: 0.75, recover: 1.5, attack: 'charge', dmg: 20, radius: 1.5, height: 2.4, meat: 3, essence: 16, mass: 0.8 }),
  duskfang: T({ name: 'Duskfang', look: 'duskfang', temper: 'aggressive', hp: 42, speed: 2.6, chase: 8.6, aggro: 28, range: 3.4, windup: 0.42, recover: 0.75, attack: 'bite', dmg: 10, radius: 0.8, height: 1.4, meat: 1, essence: 8, mass: 0.2, pack: 2 }),
  brute: T({ name: 'Thornback Brute', look: 'brute', temper: 'aggressive', hp: 260, speed: 1.6, chase: 5.4, aggro: 34, range: 4.6, windup: 0.95, recover: 1.4, attack: 'slam', dmg: 32, radius: 2.1, height: 3.6, meat: 4, essence: 45, mass: 1 }),
  wisp: T({ name: 'Ember Wisp', look: 'wisp', temper: 'aggressive', hp: 30, speed: 2.5, chase: 5.5, aggro: 36, range: 26, windup: 0.6, recover: 0.5, attack: 'bolt', dmg: 12, radius: 0.7, height: 3.2, meat: 0, essence: 18, mass: 0, hover: 2.4, nightOnly: true, bolt: 0xff5a18 }),
  // ---------------- Frostfang Tundra ----------------
  woolhorn: T({ name: 'Woolhorn', look: 'woolhorn', temper: 'passive', hp: 95, speed: 1.8, flee: 7.4, fleeDist: 8, radius: 1.5, height: 2.6, meat: 4, essence: 8, mass: 0.6 }),
  snowskip: T({ name: 'Snowskip', look: 'snowskip', temper: 'passive', hp: 18, speed: 3, flee: 12, fleeDist: 14, radius: 0.5, height: 0.8, meat: 1, essence: 14, mass: 0 }),
  glaciertusk: T({ name: 'Glacier Tusk', look: 'glaciertusk', temper: 'neutral', hp: 200, speed: 1.6, chase: 7.8, aggro: 30, range: 10, windup: 0.8, recover: 1.5, attack: 'charge', dmg: 27, radius: 1.7, height: 2.7, meat: 4, essence: 26, mass: 0.9 }),
  icemaw: T({ name: 'Icemaw', look: 'icemaw', temper: 'aggressive', hp: 62, speed: 2.6, chase: 8.9, aggro: 30, range: 3.5, windup: 0.4, recover: 0.7, attack: 'bite', dmg: 13, radius: 0.85, height: 1.5, meat: 1, essence: 13, mass: 0.2, pack: 2, effect: 'chill' }),
  frostwraith: T({ name: 'Frost Wraith', look: 'frostwraith', temper: 'aggressive', hp: 46, speed: 2.5, chase: 5.8, aggro: 38, range: 28, windup: 0.6, recover: 0.5, attack: 'bolt', dmg: 14, radius: 0.75, height: 3.2, meat: 0, essence: 24, mass: 0, hover: 2.6, bolt: 0x5ac8ff, effect: 'chill' }),
  hoarbrute: T({ name: 'Hoarfrost Brute', look: 'hoarbrute', temper: 'aggressive', hp: 350, speed: 1.6, chase: 5.6, aggro: 34, range: 4.8, windup: 0.9, recover: 1.3, attack: 'slam', dmg: 38, radius: 2.2, height: 3.8, meat: 5, essence: 60, mass: 1, effect: 'chill' }),
  // ---------------- Cinder Wastes ----------------
  ashskitter: T({ name: 'Ashskitter', look: 'ashskitter', temper: 'passive', hp: 55, speed: 2.6, flee: 9.4, fleeDist: 10, radius: 1.0, height: 1.0, meat: 2, essence: 8, mass: 0.3 }),
  emberling: T({ name: 'Emberling', look: 'emberling', temper: 'passive', hp: 22, speed: 3.2, flee: 12.5, fleeDist: 14, radius: 0.5, height: 0.8, meat: 1, essence: 20, mass: 0 }),
  slagshell: T({ name: 'Slagshell', look: 'slagshell', temper: 'neutral', hp: 280, speed: 1.3, chase: 7, aggro: 28, range: 10, windup: 0.9, recover: 1.7, attack: 'charge', dmg: 33, radius: 1.9, height: 2.3, meat: 5, essence: 36, mass: 1 }),
  cinderhound: T({ name: 'Cinderhound', look: 'cinderhound', temper: 'aggressive', hp: 82, speed: 2.8, chase: 9.3, aggro: 32, range: 3.6, windup: 0.38, recover: 0.65, attack: 'bite', dmg: 16, radius: 0.9, height: 1.5, meat: 1, essence: 18, mass: 0.25, pack: 2, effect: 'burn' }),
  emberwisp: T({ name: 'Cinder Wisp', look: 'emberwisp', temper: 'aggressive', hp: 48, speed: 2.6, chase: 6, aggro: 38, range: 28, windup: 0.55, recover: 0.45, attack: 'bolt', dmg: 16, radius: 0.75, height: 3.2, meat: 0, essence: 26, mass: 0, hover: 2.5, bolt: 0xff3a10, effect: 'burn' }),
  magmaw: T({ name: 'Magmaw', look: 'magmaw', temper: 'aggressive', hp: 470, speed: 1.7, chase: 5.8, aggro: 36, range: 5, windup: 0.85, recover: 1.2, attack: 'slam', dmg: 46, radius: 2.4, height: 4.1, meat: 6, essence: 90, mass: 1, effect: 'burn' }),
};

const min = Math.min, fl = Math.floor;
/** How many of each monster should be alive near the player, per map. */
export const SPAWNS = {
  vale: (d, n) => ({ grazer: 6, hare: 4, stonehorn: 2, duskfang: min(10, (n ? 4 : 2) + fl((d - 1) * 1.5)), brute: min(3, d - 1 + (n ? 1 : 0)), wisp: n ? min(6, 2 + d) : 0 }),
  tundra: (d, n) => ({ woolhorn: 4, snowskip: 4, glaciertusk: 2, icemaw: min(10, (n ? 5 : 3) + d - 1), frostwraith: min(6, (n ? 3 : 1) + fl(d / 2)), hoarbrute: min(3, 1 + fl((d - 1) / 2) + (n ? 1 : 0)) }),
  wastes: (d, n) => ({ ashskitter: 5, emberling: 3, slagshell: 2, cinderhound: min(12, (n ? 6 : 4) + d - 1), emberwisp: min(7, (n ? 4 : 2) + fl(d / 2)), magmaw: min(4, 1 + fl(d / 2) + (n ? 1 : 0)) }),
};
/** What is already wandering nearby when you arrive: [type, minDist, maxDist, count]. */
export const SEEDS = {
  vale: [['grazer', 22, 34, 2], ['grazer', 35, 60, 2], ['hare', 18, 40, 1], ['hare', 30, 60, 2], ['stonehorn', 40, 70, 1], ['duskfang', 70, 95, 2]],
  tundra: [['woolhorn', 24, 40, 2], ['snowskip', 20, 45, 2], ['glaciertusk', 40, 70, 1], ['icemaw', 65, 90, 2], ['frostwraith', 75, 100, 1]],
  wastes: [['ashskitter', 22, 40, 2], ['emberling', 22, 45, 2], ['slagshell', 40, 65, 1], ['cinderhound', 60, 85, 2], ['emberwisp', 70, 95, 1]],
};

// ---------------------------------------------------------------- model parts
const BOX = new THREE.BoxGeometry(1, 1, 1);
const ICO = new THREE.IcosahedronGeometry(0.5, 1);
const SPH = new THREE.SphereGeometry(0.5, 10, 8);
const CONE = new THREE.ConeGeometry(0.5, 1, 6);
const CYL = new THREE.CylinderGeometry(0.34, 0.5, 1, 7); // tapered: narrow end at +Y

function part(geo, mat, s, p, parent, r) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(s[0], s[1], s[2]); m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  m.castShadow = true;
  parent.add(m);
  return m;
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
const glowMat = (color, k = 2.6) => new THREE.MeshStandardMaterial({ color: 0x120805, emissive: color, emissiveIntensity: k, flatShading: true });
const grp = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

/**
 * Four-legged body: torso (shoulders, haunch, belly), neck, head with snout, hinged jaw, ears and brows,
 * two-segment legs with feet, and a tail.
 */
function quad(o) {
  const g = new THREE.Group();
  const body = std(o.color), dark = std(new THREE.Color(o.color).multiplyScalar(0.5));
  const belly = std(o.belly ?? new THREE.Color(o.color).lerp(new THREE.Color(0xffffff), 0.28));
  const eye = new THREE.MeshStandardMaterial({ color: 0, emissive: o.eye, emissiveIntensity: 4 });
  const bone = std(0xe9e2c8);
  const by = o.leg + o.h / 2, hd = o.head, sn = o.snout ?? 0.7;
  const torso = grp(g, 0, by, 0);
  part(ICO, body, [o.w, o.h, o.len * 0.82], [0, 0, 0], torso);
  part(ICO, body, [o.w * 1.02, o.h * 1.06, o.len * 0.5], [0, o.h * 0.07, o.len * 0.27], torso);
  part(ICO, body, [o.w * 0.94, o.h * 0.94, o.len * 0.46], [0, -o.h * 0.01, -o.len * 0.3], torso);
  part(ICO, belly, [o.w * 0.78, o.h * 0.6, o.len * 0.74], [0, -o.h * 0.23, 0.02], torso);

  // neck + head hang off a shoulder pivot so grazing can dip the whole front end
  const front = grp(g, 0, by + o.h * 0.16, o.len * 0.36);
  const nk = o.neck ?? 0.35, ny = o.h * (0.15 + nk * 0.75), nz = o.h * (0.25 + nk * 0.35) + hd * 0.25;
  const nl = Math.hypot(ny, nz);
  part(CYL, body, [hd * 0.85, nl, hd * 0.85], [0, ny / 2, nz / 2], front, [Math.atan2(nz, ny), 0, 0]);
  const head = grp(front, 0, ny, nz);
  part(ICO, body, [hd * 0.92, hd * 0.86, hd * 1.05], [0, 0, 0], head);
  part(CYL, body, [hd * 0.66, sn * hd, hd * 0.54], [0, -hd * 0.1, hd * 0.4 + sn * hd * 0.45], head, [Math.PI / 2, 0, 0]);
  part(ICO, dark, [hd * 0.26, hd * 0.2, hd * 0.2], [0, -hd * 0.03, hd * 0.42 + sn * hd * 0.95], head);
  const jaw = grp(head, 0, -hd * 0.3, hd * 0.25);
  part(BOX, dark, [hd * 0.4, hd * 0.12, sn * hd * 0.95], [0, 0, sn * hd * 0.5], jaw);
  if (o.teeth) {
    for (const s of [-1, 1]) {
      part(CONE, bone, [hd * 0.09, hd * 0.26, hd * 0.09], [s * hd * 0.17, -hd * 0.32, hd * 0.42 + sn * hd * 0.78], head, [Math.PI, 0, 0]);
      part(CONE, bone, [hd * 0.07, hd * 0.18, hd * 0.07], [s * hd * 0.15, -hd * 0.3, hd * 0.42 + sn * hd * 0.45], head, [Math.PI, 0, 0]);
      part(CONE, bone, [hd * 0.07, hd * 0.2, hd * 0.07], [s * hd * 0.13, hd * 0.14, sn * hd * 0.85], jaw);
    }
  }
  for (const s of [-1, 1]) {
    part(SPH, eye, [hd * 0.17, hd * 0.17, hd * 0.17], [s * hd * 0.36, hd * 0.14, hd * 0.36], head);
    if (o.brow) part(BOX, dark, [hd * 0.3, hd * 0.09, hd * 0.24], [s * hd * 0.33, hd * 0.27, hd * 0.36], head, [0.25, 0, -s * 0.5]);
    if (o.ears === 'point') part(CONE, body, [hd * 0.26, hd * 0.5, hd * 0.14], [s * hd * 0.32, hd * 0.5, -hd * 0.2], head, [-0.2, 0, -s * 0.35]);
    else if (o.ears === 'long') part(BOX, body, [hd * 0.2, hd * 1.4, hd * 0.32], [s * hd * 0.26, hd * 1.0, -hd * 0.22], head, [-0.3, 0, -s * 0.16]);
    else if (o.ears === 'flop') part(BOX, body, [hd * 0.12, hd * 0.5, hd * 0.34], [s * hd * 0.5, hd * 0.05, -hd * 0.15], head, [0, 0, s * 0.35]);
  }

  // legs: hip → upper → knee → lower → foot
  const legs = [], knees = [];
  const total = o.leg + o.h * 0.18, L1 = total * 0.52, L2 = total * 0.48, lw = o.legW ?? o.w * 0.3;
  for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
    const hip = grp(g, sx * o.w * 0.33, total, sz * o.len * 0.3);
    part(CYL, body, [lw, L1, lw * 1.15], [0, -L1 / 2, 0], hip, [Math.PI, 0, 0]);
    const knee = grp(hip, 0, -L1, 0);
    part(ICO, body, [lw * 0.8, lw * 0.8, lw * 0.8], [0, 0, 0], knee);
    part(CYL, dark, [lw * 0.72, L2, lw * 0.72], [0, -L2 / 2, 0], knee, [Math.PI, 0, 0]);
    part(BOX, dark, [lw * 0.95, L2 * 0.2, lw * 1.3], [0, -L2 + L2 * 0.1, lw * 0.2], knee);
    legs.push(hip); knees.push(knee);
  }

  // tail
  const tail = grp(g, 0, by + o.h * 0.12, -o.len * 0.42);
  const tk = o.tail ?? 'thin', tlen = o.len * (o.tailLen ?? 0.45);
  if (tk === 'bushy') part(ICO, body, [o.w * 0.34, o.w * 0.34, tlen * 1.3], [0, 0, -tlen * 0.6], tail, [0.35, 0, 0]);
  else if (tk === 'stub') part(ICO, belly, [o.w * 0.3, o.w * 0.3, o.w * 0.3], [0, 0, -o.w * 0.1], tail);
  else {
    part(CYL, body, [o.w * 0.2, tlen, o.w * 0.2], [0, -tlen * 0.2, -tlen * 0.45], tail, [-1.95, 0, 0]);
    if (tk === 'club') part(ICO, dark, [o.w * 0.42, o.w * 0.42, o.w * 0.42], [0, -tlen * 0.4, -tlen * 0.95], tail);
    else part(ICO, dark, [o.w * 0.16, o.w * 0.16, o.w * 0.3], [0, -tlen * 0.4, -tlen * 0.95], tail);
  }
  return { g, torso, front, head, jaw, legs, knees, tail, mats: [body, dark, belly], eye, by, bone, o };
}
/** Row of spikes / plates / fur along the spine. */
function spine(m, n, size, mat, geo = CONE, lean = -0.45) {
  const o = m.o;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5, z = o.len * (0.36 - t * 0.74), k = 0.7 + Math.sin(t * Math.PI) * 0.5;
    part(geo, mat, [size * 0.45 * k, size * k, size * 0.45 * k], [0, o.h * 0.5 + size * k * 0.3, z], m.torso, [lean, 0, 0]);
  }
}
function horns(m, len, mat, spread = 0.5, curve = 0.5) {
  const hd = m.o.head;
  for (const s of [-1, 1]) {
    part(CONE, mat, [hd * 0.2, len, hd * 0.2], [s * hd * 0.3, hd * 0.42, -hd * 0.1], m.head, [-curve, 0, -s * spread]);
  }
}
function tusks(m, len, mat) {
  const hd = m.o.head, sn = m.o.snout ?? 0.7;
  for (const s of [-1, 1]) part(CONE, mat, [hd * 0.17, len, hd * 0.17], [s * hd * 0.36, -hd * 0.12, hd * 0.4 + sn * hd * 0.6], m.head, [1.0, 0, -s * 0.35]);
}
function shag(m, mat, n = 9) {
  const o = m.o;
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1, z = o.len * (0.36 - (i / (n - 1)) * 0.72);
    part(ICO, mat, [o.w * 0.34, o.h * (0.6 + (i % 3) * 0.12), o.len * 0.2], [s * o.w * 0.4, -o.h * 0.2, z], m.torso, [0, 0, s * 0.18]);
  }
}
function thorns(m, n, mat, size) {
  const o = m.o;
  for (let i = 0; i < n; i++) {
    const a = (Math.random() - 0.5) * 1.7;
    part(CONE, mat, [size * 0.3, size * (0.7 + Math.random() * 0.7), size * 0.3], [Math.sin(a) * o.w * 0.45, Math.cos(a) * o.h * 0.48, o.len * (0.4 - Math.random() * 0.8)], m.torso, [-0.3, 0, -a]);
  }
}
function floater(coreColor, shellColor, cloak) {
  const g = new THREE.Group();
  const core = new THREE.MeshStandardMaterial({ color: 0x120805, emissive: coreColor, emissiveIntensity: 3.5, flatShading: true });
  const shell = std(shellColor);
  const c = part(ICO, core, [0.9, 0.9, 0.9], [0, 0, 0], g);
  part(ICO, shell, [0.5, 0.5, 0.5], [0, 0, 0], c);
  const shards = [];
  for (let i = 0; i < 6; i++) shards.push(part(CONE, shell, [0.2, 0.75, 0.2], [0, 0, 0], g));
  if (cloak) for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.283;
    part(CONE, shell, [0.3, 1.5 + (i % 3) * 0.35, 0.3], [Math.cos(a) * 0.38, -1.0, Math.sin(a) * 0.38], g, [Math.PI + Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2]);
  }
  return { g, legs: [], knees: [], head: c, mats: [shell], eye: core, shards, by: 0 };
}

const BUILD = {
  grazer() {
    const m = quad({ w: 0.9, h: 0.85, len: 1.75, leg: 0.85, head: 0.46, neck: 0.75, snout: 0.8, color: 0x7b7a55, eye: 0x9dff8a, ears: 'point', tail: 'stub' });
    const moss = std(0x4c8f3a), ant = std(0xd8cfae);
    spine(m, 6, 0.5, moss, ICO, 0);
    for (const s of [-1, 1]) {
      part(CONE, ant, [0.07, 0.55, 0.07], [s * 0.15, 0.45, -0.08], m.head, [-0.3, 0, -s * 0.45]);
      part(CONE, ant, [0.05, 0.3, 0.05], [s * 0.3, 0.62, -0.05], m.head, [0.4, 0, -s * 0.9]);
    }
    m.mats.push(moss, ant);
    return m;
  },
  hare(color = 0xd9e2ff, glow = 0x2a6cff, eye = 0x66e0ff) {
    const m = quad({ w: 0.4, h: 0.38, len: 0.66, leg: 0.28, head: 0.3, neck: 0.1, snout: 0.45, color, eye, ears: 'long', tail: 'stub', legW: 0.11 });
    part(ICO, glowMat(glow, 1.4), [0.16, 0.1, 0.3], [0, 0.2, 0], m.torso);
    return m;
  },
  snowskip: () => BUILD.hare(0xffffff, 0x8fe6ff, 0x9af0ff),
  emberling: () => BUILD.hare(0x3a2a26, 0xff7a22, 0xffb040),
  stonehorn() {
    const m = quad({ w: 1.4, h: 1.25, len: 2.4, leg: 0.95, head: 0.82, neck: 0.15, snout: 0.75, color: 0x7d7a72, eye: 0xffd060, ears: 'flop', tail: 'thin' });
    const plate = std(0x55524c);
    spine(m, 5, 0.75, plate, BOX, 0.3);
    part(CONE, m.bone, [0.32, 1.35, 0.32], [0, 0.18, 0.98], m.head, [1.2, 0, 0]);
    part(CONE, m.bone, [0.2, 0.6, 0.2], [0, 0.32, 0.5], m.head, [0.9, 0, 0]);
    for (const s of [-1, 1]) part(BOX, plate, [0.22, 0.7, 0.9], [s * 0.72, 0.1, 0.55], m.torso, [0, 0, s * 0.2]);
    m.mats.push(plate, m.bone);
    return m;
  },
  duskfang() {
    const m = quad({ w: 0.6, h: 0.62, len: 1.5, leg: 0.7, head: 0.46, neck: 0.3, snout: 0.9, color: 0x3d3549, eye: 0xff2a18, ears: 'point', tail: 'bushy', teeth: true, brow: true, legW: 0.17 });
    const sp = std(0x1c1822);
    spine(m, 7, 0.42, sp);
    m.mats.push(sp, m.bone);
    return m;
  },
  brute() {
    const m = quad({ w: 2.1, h: 2.0, len: 3.3, leg: 1.35, head: 1.1, neck: 0.1, snout: 0.6, color: 0x4d3b30, eye: 0xff5a10, ears: 'flop', tail: 'club', teeth: true, brow: true });
    const th = std(0x2a1f18);
    thorns(m, 18, th, 1.0); tusks(m, 0.9, m.bone);
    m.mats.push(th, m.bone);
    return m;
  },
  wisp: () => floater(0xff6a18, 0x2a2422, false),
  woolhorn() {
    const m = quad({ w: 1.5, h: 1.5, len: 2.5, leg: 0.95, head: 0.8, neck: 0.3, snout: 0.7, color: 0xb9a78e, eye: 0xbfe6ff, ears: 'flop', tail: 'stub', legW: 0.42 });
    const wool = std(0xe9e4da);
    shag(m, wool, 11); spine(m, 6, 0.8, wool, ICO, 0);
    horns(m, 1.0, m.bone, 1.3, -0.4);
    m.mats.push(wool, m.bone);
    return m;
  },
  glaciertusk() {
    const m = quad({ w: 1.6, h: 1.4, len: 2.6, leg: 1.0, head: 0.9, neck: 0.15, snout: 0.8, color: 0x8ea6bd, eye: 0xa8f0ff, ears: 'flop', tail: 'thin', brow: true });
    const ice = new THREE.MeshStandardMaterial({ color: 0xcfeaff, emissive: 0x2a7fd0, emissiveIntensity: 0.6, roughness: 0.25, flatShading: true });
    spine(m, 6, 1.0, ice, CONE, -0.25); tusks(m, 1.3, ice);
    m.extra = [ice];
    return m;
  },
  icemaw() {
    const m = quad({ w: 0.66, h: 0.68, len: 1.6, leg: 0.75, head: 0.5, neck: 0.3, snout: 0.9, color: 0xdfe8f2, belly: 0xffffff, eye: 0x3ad0ff, ears: 'point', tail: 'bushy', teeth: true, brow: true, legW: 0.18 });
    const ice = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, emissive: 0x2a8fe0, emissiveIntensity: 0.9, roughness: 0.25, flatShading: true });
    spine(m, 6, 0.5, ice);
    m.mats.push(m.bone); m.extra = [ice];
    return m;
  },
  frostwraith: () => floater(0x5ac8ff, 0xc9dcec, true),
  hoarbrute() {
    const m = quad({ w: 2.2, h: 2.1, len: 3.3, leg: 1.45, head: 1.15, neck: 0.1, snout: 0.6, color: 0xc9d6e2, belly: 0xf4f8fb, eye: 0x5ad8ff, ears: 'flop', tail: 'stub', teeth: true, brow: true, legW: 0.7 });
    const wool = std(0xf2f5f8);
    const ice = new THREE.MeshStandardMaterial({ color: 0xcfeaff, emissive: 0x2a7fd0, emissiveIntensity: 0.8, roughness: 0.25, flatShading: true });
    shag(m, wool, 13); thorns(m, 12, ice, 1.2); horns(m, 1.5, ice, 1.1, 0.2);
    m.mats.push(wool, m.bone); m.extra = [ice];
    return m;
  },
  ashskitter() {
    const m = quad({ w: 1.1, h: 0.5, len: 1.9, leg: 0.3, head: 0.42, neck: 0.05, snout: 1.0, color: 0x5a4a44, eye: 0xffc040, ears: 'none', tail: 'thin', tailLen: 0.9, legW: 0.2 });
    const pl = std(0x2a2422);
    spine(m, 8, 0.36, pl, BOX, 0.5);
    m.mats.push(pl);
    return m;
  },
  slagshell() {
    const m = quad({ w: 1.9, h: 1.1, len: 2.6, leg: 0.75, head: 0.7, neck: 0.25, snout: 0.6, color: 0x4a3f3a, eye: 0xff9a30, ears: 'none', tail: 'thin', legW: 0.55 });
    const shell = std(0x262120), lava = glowMat(0xff4a12, 2.2);
    part(ICO, shell, [2.3, 1.6, 2.9], [0, 0.42, -0.05], m.torso);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.283;
      part(BOX, lava, [0.12, 0.08, 0.9], [Math.cos(a) * 0.7, 1.0 + Math.sin(i * 2.1) * 0.12, Math.sin(a) * 0.9 - 0.05], m.torso, [0, -a, 0]);
      part(CONE, shell, [0.4, 0.7, 0.4], [Math.cos(a) * 0.95, 0.75, Math.sin(a) * 1.2 - 0.05], m.torso, [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]);
    }
    part(CONE, shell, [0.3, 0.9, 0.3], [0, 0.2, 0.7], m.head, [1.2, 0, 0]);
    m.mats.push(shell); m.extra = [lava];
    return m;
  },
  cinderhound() {
    const m = quad({ w: 0.68, h: 0.7, len: 1.65, leg: 0.78, head: 0.52, neck: 0.3, snout: 0.95, color: 0x231b1a, belly: 0x4a2014, eye: 0xffb020, ears: 'point', tail: 'thin', teeth: true, brow: true, legW: 0.19 });
    const fire = glowMat(0xff5a18, 3);
    spine(m, 8, 0.5, fire);
    part(ICO, fire, [0.2, 0.2, 0.34], [0, -0.42, -0.75], m.tail);
    m.mats.push(m.bone); m.extra = [fire];
    return m;
  },
  emberwisp: () => floater(0xff3a10, 0x1a1414, true),
  magmaw() {
    const m = quad({ w: 2.4, h: 2.3, len: 3.6, leg: 1.5, head: 1.25, neck: 0.1, snout: 0.65, color: 0x2a2220, belly: 0x5a1c0c, eye: 0xffc030, ears: 'none', tail: 'club', teeth: true, brow: true, legW: 0.78 });
    const rock = std(0x161212), lava = glowMat(0xff4a12, 3);
    thorns(m, 16, rock, 1.3); thorns(m, 9, lava, 0.7); horns(m, 1.6, rock, 0.9, 0.3); tusks(m, 1.0, m.bone);
    for (const s of [-1, 1]) part(BOX, lava, [0.1, 1.2, 2.2], [s * 1.12, -0.1, 0], m.torso, [0, 0, s * 0.15]);
    m.mats.push(rock, m.bone); m.extra = [lava];
    return m;
  },
};

function angDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

class Monster {
  constructor(type, x, z) {
    this.type = type;
    this.def = TYPES[type];
    this.model = BUILD[this.def.look]();
    this.g = this.model.g;
    this.g.rotation.order = 'YXZ';
    this.pos = this.g.position;
    this.pos.set(x, heightAt(x, z), z);
    for (const m of this.model.mats) m.userData.base = m.emissive.clone();
    this.eyeBase = this.model.eye.emissiveIntensity;
    this.hp = this.maxHp = this.def.hp;
    this.state = 'wander';
    this.timer = Math.random() * 3;
    this.face = Math.random() * 6.28;
    this.g.rotation.y = this.face;
    this.phase = Math.random() * 6;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.shootCd = 1 + Math.random() * 2;
    this.flashT = this.slowT = this.hurtT = 0; this.graze = 0;
    this.provoked = false; this.dead = false; this.remove = false;
    this.dist = 60;
  }

  get center() { return this._c = (this._c || new THREE.Vector3()).set(this.pos.x, this.pos.y + (this.def.hover ? 0 : this.def.height * 0.5), this.pos.z); }

  showBar() {
    if (!this.bar) {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8;
      this.barCtx = cv.getContext('2d');
      this.barTex = new THREE.CanvasTexture(cv);
      this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barTex, depthWrite: false, fog: false }));
      this.bar.scale.set(Math.max(1.2, this.def.radius * 1.8), 0.14, 1);
      this.bar.position.y = this.def.hover ? 1.2 : this.def.height + 0.6;
      this.g.add(this.bar);
    }
    const c = this.barCtx, f = Math.max(0, this.hp / this.maxHp);
    c.fillStyle = '#140808'; c.fillRect(0, 0, 64, 8);
    c.fillStyle = this.def.temper === 'aggressive' ? '#e0402a' : this.def.temper === 'neutral' ? '#e0b040' : '#7fd060';
    c.fillRect(1, 1, 62 * f, 6);
    this.barTex.needsUpdate = true;
  }

  takeDamage(dmg, game, dirX = 0, dirZ = 0, kb = 0) {
    if (this.dead) return;
    this.hp -= dmg;
    this.flashT = 0.12; this.hurtT = 1.2;
    this.showBar();
    const k = kb * (1 - this.def.mass);
    this.pos.x += dirX * k; this.pos.z += dirZ * k;
    if (this.def.temper !== 'passive') {
      this.provoked = true;
      if (this.state === 'wander') { this.state = 'chase'; game.sfx.growl(this.def.radius); }
      else if (this.state === 'windup' && this.def.mass < 0.5) { this.state = 'recover'; this.timer = 0.45; }
    }
    if (this.hp <= 0) this.die(game, true);
  }

  die(game, loot) {
    this.dead = true; this.deadT = 0;
    if (this.bar) this.bar.visible = false;
    this.model.eye.emissiveIntensity = 0;
    if (loot) game.onKill(this);
  }

  update(dt, game) {
    const P = game.player.pos, pos = this.pos, def = this.def, M = this.model;
    const dx = P.x - pos.x, dz = P.z - pos.z, d = Math.hypot(dx, dz) || 0.001;
    this.dist = d;
    if (this.dead) {
      this.deadT += dt;
      if (def.hover) { this.g.scale.multiplyScalar(Math.max(0, 1 - dt * 3)); pos.y -= dt * 2; }
      else {
        this.g.rotation.z = Math.min(Math.PI / 2, this.deadT * 5);
        if (this.deadT > 3) pos.y -= dt * 0.7;
      }
      if (this.deadT > 5) this.remove = true;
      return;
    }
    this.flashT -= dt; this.slowT -= dt; this.hurtT -= dt; this.timer -= dt;
    const toP = Math.atan2(dx, dz);
    const hostile = def.temper === 'aggressive' || this.provoked;
    const aggro = (def.aggro || 0) * (game.isNight ? 1.35 : 1);
    let speed = 0, move = this.face, face = this.face, squash = 0;

    switch (this.state) {
      case 'wander':
        if (this.walking) {
          const tx = this.tx - pos.x, tz = this.tz - pos.z;
          if (tx * tx + tz * tz < 1) this.walking = false;
          else { move = face = Math.atan2(tx, tz); speed = def.speed; }
        }
        if (this.timer <= 0) {
          this.walking = Math.random() < 0.6;
          this.timer = 2 + Math.random() * 4;
          if (this.walking) {
            const a = Math.random() * 6.28, r = 6 + Math.random() * 14;
            this.tx = pos.x + Math.sin(a) * r; this.tz = pos.z + Math.cos(a) * r;
          }
        }
        if (hostile) { if (d < aggro) { this.state = 'chase'; game.sfx.growl(def.radius); } }
        else if (def.temper === 'passive' && (d < def.fleeDist || this.hurtT > 0)) {
          this.state = 'flee'; this.timer = 3 + Math.random() * 2; this.wob = (Math.random() - 0.5) * 1.2;
        }
        break;
      case 'flee':
        move = face = toP + Math.PI + this.wob; speed = def.flee;
        if (this.timer <= 0) {
          if (d > def.fleeDist * 2.4) this.state = 'wander';
          else { this.timer = 1.5; this.wob = (Math.random() - 0.5) * 1.4; }
        }
        break;
      case 'chase':
        if (d > aggro * 2.4) { this.state = 'wander'; this.provoked = false; break; }
        face = toP;
        if (def.attack === 'bolt') {
          this.shootCd -= dt;
          if (d > 17) { move = toP; speed = def.chase; }
          else if (d < 9) { move = toP + Math.PI; speed = def.chase * 0.8; }
          else { move = toP + (Math.PI / 2) * this.side; speed = def.chase * 0.5; if (Math.random() < dt * 0.3) this.side *= -1; }
          if (this.shootCd <= 0 && d < def.range) { this.state = 'windup'; this.timer = def.windup; }
        } else {
          move = toP; speed = def.chase;
          if (d < def.range) { this.state = 'windup'; this.timer = def.windup; }
        }
        break;
      case 'windup':
        face = toP; squash = 1 - this.timer / def.windup;
        if (this.timer <= 0) {
          this.lock = toP; this.didHit = false;
          if (def.attack === 'bite') { this.state = 'strike'; this.timer = 0.28; }
          else if (def.attack === 'charge') { this.state = 'strike'; this.timer = 1.1; game.sfx.growl(1.6); }
          else if (def.attack === 'slam') {
            const cx = pos.x + Math.sin(toP) * (def.radius + 1), cz = pos.z + Math.cos(toP) * (def.radius + 1);
            game.slam(cx, cz, 4.4, def.dmg, def.name, pos, def.effect);
            this.state = 'recover'; this.timer = def.recover;
          } else {
            game.enemyBolt(this.center, def.dmg, def.name, def.bolt, def.effect);
            this.state = 'recover'; this.timer = def.recover; this.shootCd = 1.6 + Math.random() * 1.2;
          }
        }
        break;
      case 'strike':
        move = face = this.lock; speed = def.attack === 'bite' ? 15 : 16;
        if (!this.didHit && d < def.radius + 1.1) {
          this.didHit = true;
          game.damagePlayer(def.dmg, pos, def.name, def.attack === 'charge' ? 14 : 6, def.effect);
        }
        if (this.timer <= 0) { this.state = 'recover'; this.timer = def.recover; }
        break;
      case 'recover':
        if (this.timer <= 0) this.state = hostile ? 'chase' : 'wander';
        break;
    }

    if (this.slowT > 0) speed *= 0.4;
    pos.x += Math.sin(move) * speed * dt; pos.z += Math.cos(move) * speed * dt;
    const r = Math.hypot(pos.x, pos.z);
    if (r > WORLD_R) { pos.x *= WORLD_R / r; pos.z *= WORLD_R / r; this.walking = false; }
    this.phase += dt * (1.5 + Math.abs(speed) * 1.6);
    const ground = heightAt(pos.x, pos.z);
    pos.y = def.hover ? ground + def.hover + Math.sin(this.phase * 0.6) * 0.3 : ground;

    this.face += angDiff(this.face, face) * Math.min(1, dt * 9);
    this.g.rotation.y = this.face;

    // ---------- animation ----------
    const sw = Math.min(1, Math.abs(speed) / 3) * 0.7;
    M.legs.forEach((l, i) => {
      const ph = this.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0);
      l.rotation.x = Math.sin(ph) * sw;
      M.knees[i].rotation.x = Math.max(0, Math.sin(ph + 1.3)) * sw * 1.3 + (i > 1 ? -0.12 : 0.12);
    });
    if (def.hover) {
      M.head.rotation.y += dt * 2; M.head.rotation.x += dt * 1.3;
      const rad = 0.9 - squash * 0.35;
      M.shards.forEach((s, i) => {
        const a = this.phase * 0.5 + i * 1.047;
        s.position.set(Math.cos(a) * rad, Math.sin(a * 1.7) * 0.28, Math.sin(a) * rad);
        s.rotation.set(a, a * 0.5, 0);
      });
    } else {
      const grazing = this.state === 'wander' && !this.walking && def.temper !== 'aggressive';
      this.graze += ((grazing ? 1 : 0) - this.graze) * Math.min(1, dt * 3);
      const biting = this.state === 'strike' && def.attack === 'bite';
      M.front.rotation.x = this.graze * 0.85 - squash * 0.25 + Math.sin(this.phase) * sw * 0.06;
      M.head.rotation.x = -this.graze * 0.3;
      M.jaw.rotation.x = squash * 0.6 + (biting ? 0.7 : 0) + (this.graze > 0.6 ? Math.abs(Math.sin(this.phase * 2)) * 0.2 : 0);
      M.tail.rotation.y = Math.sin(this.phase * 0.8) * (0.25 + sw * 0.4);
      M.torso.scale.setScalar(1 + Math.sin(this.phase * 0.45) * 0.015);
      M.torso.position.y = M.by + Math.abs(Math.sin(this.phase)) * sw * 0.07;
      this.g.scale.y = 1 - squash * 0.14;
      this.g.rotation.x = def.attack === 'slam' ? -squash * 0.32 : biting ? -0.25 : 0;
    }
    M.eye.emissiveIntensity = this.eyeBase * (this.state === 'windup' ? 2 + Math.sin(this.phase * 20) : 1);
    for (const m of M.mats) {
      if (this.flashT > 0) m.emissive.setRGB(0.9, 0.9, 0.9);
      else if (this.slowT > 0) m.emissive.setRGB(0.04, 0.16, 0.4);
      else m.emissive.copy(m.userData.base);
    }
  }
}

export class MonsterManager {
  constructor(scene, game) {
    this.scene = scene; this.game = game; this.list = []; this.t = 0;
  }
  spawn(type, x, z) {
    const m = new Monster(type, x, z);
    this.scene.add(m.g); this.list.push(m);
    return m;
  }
  spawnNear(type, minD, maxD, n = 1) {
    const P = this.game.player.pos;
    const a = Math.random() * 6.28, r = minD + Math.random() * (maxD - minD);
    const x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
    if (Math.hypot(x, z) > WORLD_R - 5) return;
    for (let i = 0; i < n; i++) this.spawn(type, x + (Math.random() - 0.5) * 8, z + (Math.random() - 0.5) * 8);
  }
  seed() { for (const [type, a, b, n] of SEEDS[this.game.mapId]) this.spawnNear(type, a, b, n); }
  dispose(m) {
    this.scene.remove(m.g);
    const seen = new Set();
    m.g.traverse((o) => { if (o.material && !seen.has(o.material)) { seen.add(o.material); o.material.dispose(); } });
    if (m.bar) m.barTex.dispose();
  }
  clear() { for (const m of this.list) this.dispose(m); this.list.length = 0; this.t = 0; }
  update(dt) {
    const game = this.game, L = this.list;
    for (const m of L) m.update(dt, game);
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 1;
      const want = SPAWNS[game.mapId](game.day, game.isNight), have = {};
      for (const m of L) if (!m.dead) have[m.type] = (have[m.type] || 0) + 1;
      for (const type in want) {
        if ((have[type] || 0) < want[type]) this.spawnNear(type, 85, 125, TYPES[type].pack || 1);
      }
      for (const m of L) {
        if (m.dead) continue;
        if (m.dist > 175) m.remove = true;
        else if (m.def.nightOnly && !game.isNight) { m.die(game, false); game.burst(m.center, 0xff7a22, 20, 4, 0.8, 0); }
      }
    }
    // keep bodies from stacking
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.dead || a.dist > 60) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, lim = (a.def.radius + b.def.radius) * 0.9;
        const d2 = dx * dx + dz * dz;
        if (d2 < lim * lim && d2 > 1e-4) {
          const d = Math.sqrt(d2), k = (lim - d) / d;
          const wa = b.def.mass + 0.1, wb = a.def.mass + 0.1, s = wa + wb;
          a.pos.x -= dx * k * wa / s; a.pos.z -= dz * k * wa / s;
          b.pos.x += dx * k * wb / s; b.pos.z += dz * k * wb / s;
        }
      }
    }
    for (let i = L.length - 1; i >= 0; i--) {
      if (L[i].remove) { this.dispose(L[i]); L.splice(i, 1); }
    }
  }
}
