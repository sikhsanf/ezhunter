import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SIZE = 900;
export const WORLD_R = 400;
const SEG = 300;
const CELL = SIZE / SEG;
const H = new Float32Array((SEG + 1) * (SEG + 1));
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/** Each map is its own hunting ground with its own look, hazards and monster roster (see monsters.js). */
export const MAPS = {
  home: {
    name: "Hunter's Rest", sub: 'Your cabin · safe ground, no beasts, no hunger', gate: 0xffe9a8, seed: 411.3, amp: 3, safe: true,
    liquid: { kind: 'none', level: -99, bed: 0 },
    ground: [0x3a6a2c, 0x7fa84a], dirt: 0x6a5438, rock: 0x77736a, rockLine: 99, shore: 0x6a5438,
    sky: { zen: 0x2f6fd0, hor: 0xbcd9ee, nzen: 0x04060f, nhor: 0x101c36, dusk: 0xf0a060, cloud: 0xffffff, cover: 0.42 },
    fog: [0.007, 0.011], hemiGround: 0x3a3524,
    grass: { density: 520, base: 0x3f7d2c, tip: 0xa6cf58, h: 0.42 },
    flora: [['oak', 170], ['pine', 230], ['bush', 220]], rocks: 0x86837b, ambient: 'firefly',
  },
  vale: {
    name: 'Verdant Vale', sub: 'Old forest · gentle prey, familiar predators', gate: 0x5cff8f, seed: 0, amp: 13,
    liquid: { kind: 'water', level: -5.5, bed: 0.55 },
    ground: [0x2c5226, 0x6a8f3a], dirt: 0x5e4c38, rock: 0x77736a, rockLine: 8, shore: 0x8a7a55,
    sky: { zen: 0x2a66c8, hor: 0x9ccbee, nzen: 0x03050f, nhor: 0x0d1830, dusk: 0xf08a4a, cloud: 0xffffff, cover: 0.5 },
    fog: [0.0058, 0.011], hemiGround: 0x3a3524,
    grass: { density: 620, base: 0x3f7d2c, tip: 0xa6cf58, h: 0.55 },
    flora: [['pine', 700], ['oak', 430], ['bush', 520]], rocks: 0x86837b, ambient: 'firefly',
  },
  tundra: {
    name: 'Frostfang Tundra', sub: 'Frozen steppe · their bite chills you to a crawl', gate: 0x66d8ff, seed: 91.7, amp: 9,
    liquid: { kind: 'ice', level: -3, bed: 0 },
    ground: [0xd3e0ec, 0xffffff], dirt: 0x8a95a3, rock: 0x6f7a88, rockLine: 6.5, shore: 0xa8d4ee,
    sky: { zen: 0x3f76ad, hor: 0xd5e4f0, nzen: 0x02040c, nhor: 0x10203a, dusk: 0xe8a0b0, cloud: 0xf2f6fa, cover: 0.66 },
    fog: [0.0075, 0.012], hemiGround: 0x8c9cb0,
    grass: { density: 130, base: 0x5c5a3c, tip: 0xd2c88e, h: 0.5 },
    flora: [['snowpine', 540], ['dead', 200], ['iceshard', 170]], rocks: 0x9fb0c2, ambient: 'snow',
  },
  wastes: {
    name: 'Cinder Wastes', sub: 'Volcanic badlands · lava burns, and so do the beasts', gate: 0xff6a22, seed: 233.1, amp: 16,
    liquid: { kind: 'lava', level: -6, bed: 0.25 },
    ground: [0x1d1917, 0x3a302a], dirt: 0x4a2a1c, rock: 0x2a2626, rockLine: 7, shore: 0x8a2a0a,
    sky: { zen: 0x3a1c1a, hor: 0xc8643a, nzen: 0x0a0303, nhor: 0x3a120a, dusk: 0xff5a2a, cloud: 0x5a3a34, cover: 0.74 },
    fog: [0.0085, 0.012], hemiGround: 0x4a2014,
    grass: { density: 80, base: 0x3a2a20, tip: 0x8a5a34, h: 0.45 },
    flora: [['charred', 380], ['spire', 300], ['crystal', 170]], rocks: 0x2c2a2a, ambient: 'ember',
  },
};

let seedOff = 0;
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7 + seedOff) * 43758.5453;
  return s - Math.floor(s);
}
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function rawHeight(x, z, amp) {
  let h = 0, a = amp, f = 0.009;
  for (let i = 0; i < 3; i++) {
    h += (vnoise(x * f + 17.3, z * f - 5.1) - 0.5) * 2 * a;
    a *= 0.42; f *= 2.3;
  }
  const k = Math.min(1, Math.hypot(x, z) / 60);
  return h * (0.12 + 0.88 * k * k * (3 - 2 * k));
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Terrain height, sampled from the same grid the mesh is built from. */
export function heightAt(x, z) {
  const gx = (x + SIZE / 2) / CELL, gz = (z + SIZE / 2) / CELL;
  const ix = clamp(Math.floor(gx), 0, SEG - 1), iz = clamp(Math.floor(gz), 0, SEG - 1);
  const fx = clamp(gx - ix, 0, 1), fz = clamp(gz - iz, 0, 1);
  const i = iz * (SEG + 1) + ix;
  const a = H[i], b = H[i + 1], c = H[i + SEG + 1], d = H[i + SEG + 2];
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- flora geometry
const C = (h) => new THREE.Color(h);
/** Bake a colour per vertex; fn(color, x, y, z) may shade by position. */
function tint(geo, base, fn) {
  if (geo.index) geo = geo.toNonIndexed();
  const p = geo.attributes.position, arr = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    col.set(base);
    if (fn) fn(col, p.getX(i), p.getY(i), p.getZ(i));
    arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
/** Nudge vertices by a hash of their position so shared corners stay welded. */
function jitter(geo, amt) {
  const p = geo.attributes.position;
  const h = (a, b) => { const s = Math.sin(a * 91.3 + b * 47.7) * 43758.5453; return s - Math.floor(s) - 0.5; };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + h(x + y, z) * amt, y + h(y + z, x) * amt * 0.7, z + h(z + x, y) * amt);
  }
  return geo;
}
function branch(len, r, y, tiltZ, rotY, color) {
  const g = new THREE.CylinderGeometry(r * 0.45, r, len, 5);
  g.translate(0, len / 2, 0); g.rotateZ(tiltZ); g.rotateY(rotY); g.translate(0, y, 0);
  return tint(g, color);
}
function finish(parts) {
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  g.computeVertexNormals();
  return g;
}
const FLORA = {
  pine: (snow) => {
    const parts = [tint(new THREE.CylinderGeometry(0.16, 0.42, 3.4, 7).translate(0, 1.7, 0), 0x4a3524, (c, x, y) => c.multiplyScalar(0.8 + y * 0.08))];
    for (let i = 0; i < 5; i++) {
      const r = 2.5 - i * 0.44, h = 2.7, y0 = 2.5 + i * 1.3;
      const cone = jitter(new THREE.ConeGeometry(r, h, 9, 2), 0.32).translate(0, y0 + h / 2, 0);
      const lo = C(0x18351d).lerp(C(0x3f7a3a), i / 4);
      parts.push(tint(cone, lo, (c, x, y) => {
        const t = (y - y0) / h, rad = Math.hypot(x, 0) / r;
        if (snow && t > 0.28) c.set(0xf2f6fa).multiplyScalar(0.86 + t * 0.14);
        else c.multiplyScalar(0.75 + t * 0.6 - rad * 0.08);
      }));
    }
    return finish(parts);
  },
  snowpine: () => FLORA.pine(true),
  oak: () => {
    const bark = 0x4f3a28;
    const parts = [tint(jitter(new THREE.CylinderGeometry(0.3, 0.6, 3.6, 8, 3), 0.12).translate(0, 1.8, 0), bark, (c, x, y) => c.multiplyScalar(0.75 + y * 0.08))];
    [[0.9, 0.3], [-0.85, 2.2], [0.7, 4.2], [-0.5, 5.4]].forEach(([tilt, rot], i) => parts.push(branch(2.4, 0.2, 2.6 + i * 0.25, tilt, rot, bark)));
    [[0, 5.6, 0, 2.3], [1.7, 4.6, 0.5, 1.7], [-1.6, 4.8, -0.6, 1.8], [0.3, 4.5, -1.8, 1.6], [-0.4, 4.7, 1.7, 1.6], [0.9, 6.4, -0.6, 1.4]].forEach(([x, y, z, r], i) => {
      const blob = jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.3).translate(x, y, z);
      parts.push(tint(blob, i % 2 ? 0x3d7a2c : 0x4a8a30, (c, vx, vy) => c.multiplyScalar(0.62 + (vy - y + r) / (2 * r) * 0.65)));
    });
    return finish(parts);
  },
  dead: (char) => {
    const col = char ? 0x171312 : 0x6a5f55;
    const parts = [tint(jitter(new THREE.CylinderGeometry(0.1, 0.42, 5.4, 6, 4), 0.14).translate(0, 2.7, 0), col, (c, x, y) => c.multiplyScalar(0.8 + y * 0.06))];
    [[0.8, 0.2, 2.2, 2.2], [-0.9, 1.9, 2.9, 1.9], [0.6, 3.4, 3.6, 1.6], [-0.7, 4.6, 4.2, 1.3], [1.1, 5.5, 3.1, 1.2]].forEach(([tilt, rot, y, len]) => {
      parts.push(branch(len, 0.11, y, tilt, rot, col));
      parts.push(branch(len * 0.5, 0.05, y + Math.cos(tilt) * len * 0.6, tilt * 1.7, rot + 0.5, col));
    });
    return finish(parts);
  },
  charred: () => FLORA.dead(true),
  bush: () => finish([[0, 0.5, 0, 0.75], [0.55, 0.38, 0.2, 0.55], [-0.45, 0.4, -0.3, 0.6], [0.1, 0.4, 0.55, 0.5]].map(([x, y, z, r], i) =>
    tint(jitter(new THREE.IcosahedronGeometry(r, 1), 0.2).translate(x, y, z), i % 2 ? 0x2f6a2a : 0x417f33, (c, vx, vy) => c.multiplyScalar(0.6 + vy * 0.7)))),
  spire: () => finish([[0, 0, 0.95, 8], [1.1, 0.3, 0.7, 5.5], [-0.8, 0.9, 0.75, 6.6], [0.3, -1.1, 0.6, 3.6], [-1.2, -0.6, 0.55, 2.6]].map(([x, z, r, h]) =>
    tint(new THREE.CylinderGeometry(r * 0.92, r, h, 6).translate(x, h / 2 - 0.4, z), 0x2e2b2c, (c, vx, vy) => c.multiplyScalar(0.7 + (vy / h) * 0.9)))),
  crystal: () => finish([[0, 0, 0, 2.6], [0.35, 0.5, 1.7, 1.7], [-0.4, -0.45, 3.9, 1.4], [0.2, -0.6, 5.2, 1.1]].map(([tx, tz, ry, h]) => {
    const g = new THREE.ConeGeometry(0.36, h, 5).translate(0, h / 2, 0);
    g.rotateZ(tx * 0.9); g.rotateX(tz * 0.9); g.rotateY(ry);
    return tint(g, 0xffffff, (c, x, y) => c.multiplyScalar(0.5 + y / h * 0.8));
  })),
  iceshard: () => FLORA.crystal(),
};
const FLORA_INFO = {
  pine: { r: 0.5, forest: true, s: [0.8, 1.7] }, snowpine: { r: 0.5, forest: true, s: [0.8, 1.6] },
  oak: { r: 0.7, forest: true, s: [0.8, 1.5] }, dead: { r: 0.4, s: [0.7, 1.4] }, charred: { r: 0.4, forest: true, s: [0.7, 1.5] },
  bush: { r: 0, s: [0.6, 1.5] }, spire: { r: 1.5, s: [0.6, 1.7] },
  crystal: { r: 0.3, s: [0.5, 1.4], glow: [0xff5a18, 2.6, 0x2a0d05] }, iceshard: { r: 0.3, s: [0.6, 1.9], glow: [0x3aa0ff, 0.9, 0xbfe6ff] },
};

function tuftGeometry(g, rng) {
  const pos = [], col = [], nrm = [];
  const base = C(g.base), tip = C(g.tip), c = new THREE.Color();
  const push = (x, y, z, t) => { pos.push(x, y, z); c.copy(base).lerp(tip, t); col.push(c.r, c.g, c.b); nrm.push(0, 1, 0); };
  for (let b = 0; b < 6; b++) {
    const a = rng() * 6.283, ox = (rng() - 0.5) * 0.5, oz = (rng() - 0.5) * 0.5;
    const h = g.h * (0.55 + rng() * 0.6), w = 0.05 + rng() * 0.03, lean = (rng() - 0.3) * 0.35;
    const px = Math.cos(a) * w, pz = Math.sin(a) * w, lx = -Math.sin(a) * lean, lz = Math.cos(a) * lean;
    const B0 = [ox - px, 0, oz - pz], B1 = [ox + px, 0, oz + pz];
    const M0 = [ox - px * 0.65 + lx * 0.35, h * 0.5, oz - pz * 0.65 + lz * 0.35], M1 = [ox + px * 0.65 + lx * 0.35, h * 0.5, oz + pz * 0.65 + lz * 0.35];
    const T = [ox + lx, h, oz + lz];
    push(...B0, 0); push(...B1, 0); push(...M1, 0.5);
    push(...B0, 0); push(...M1, 0.5); push(...M0, 0.5);
    push(...M0, 0.5); push(...M1, 0.5); push(...T, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

// ---------------------------------------------------------------- sky shader
const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `
uniform vec3 uZen, uHor, uSunDir, uSunCol, uCloudCol;
uniform float uTime, uNight, uCover;
varying vec3 vDir;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<5;i++){ v += a*n2(p); p = p*2.03 + 7.1; a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 col = mix(uHor, uZen, pow(up, 0.5));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.5) * (1.0 - uNight * 0.8);
  col += uSunCol * smoothstep(0.9992, 0.9996, sd) * 18.0;
  float md = max(dot(d, -uSunDir), 0.0);
  col += vec3(0.75, 0.85, 1.0) * (smoothstep(0.9995, 0.9997, md) * 2.6 + pow(md, 160.0) * 0.25) * uNight;
  if (uNight > 0.02 && d.y > 0.0) {
    vec3 p = d * 190.0, ip = floor(p);
    float r = h3(ip);
    float s = step(0.988, r) * smoothstep(0.42, 0.0, length(fract(p) - 0.5));
    col += vec3(0.9, 0.95, 1.0) * s * (0.55 + 0.45 * sin(uTime * 2.5 + r * 80.0)) * uNight * smoothstep(0.0, 0.2, d.y) * 1.8;
    col += vec3(0.25, 0.3, 0.5) * pow(fbm(d.xz * 3.0 + 4.0), 3.0) * uNight * up * 0.5; // faint galactic haze
  }
  if (d.y > 0.01) {
    vec2 uv = d.xz / (d.y + 0.09) * 1.15 + uTime * vec2(0.009, 0.004);
    float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.32, fbm(uv));
    float lit = fbm(uv * 1.7 - uSunDir.xz * 0.25);
    vec3 cc = mix(uCloudCol * 0.5, uCloudCol * 1.12, smoothstep(0.25, 0.75, lit)) + uSunCol * pow(sd, 5.0) * 0.35 * (1.0 - uNight);
    col = mix(col, cc, c * smoothstep(0.01, 0.2, d.y) * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const GATES = [[48, -34], [-48, -34], [0, -58]];

function label(text, w = 3.2) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const x = c.getContext('2d'); x.font = '600 40px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText(text, 256, 48); x.fillStyle = '#f1e8d8'; x.fillText(text, 256, 48);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false, fog: false, transparent: true }));
  s.scale.set(w, w * 96 / 512, 1);
  return s;
}
/** The hunter's log cabin with a campfire, a pedestal that shows your character, and a workbench for later gear crafting. */
function buildCabin(group, addOb, W) {
  const cz = 16, y = heightAt(0, cz);
  const g = new THREE.Group(); g.position.set(0, y, cz); group.add(g);
  const M = (c, o) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true, ...o });
  const log = M(0x7a5232), logD = M(0x5e3e26), plank = M(0x9a7448), roof = M(0x7a2f24), stone = M(0x8a867e), iron = M(0x3a3a40, { metalness: 0.4 });
  const warm = new THREE.MeshBasicMaterial({ color: 0xffffff }); warm.color.setRGB(2.4, 1.7, 0.8);
  const add = (geo, mat, x, yy, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, yy, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const LW = 8, LD = 6, R = 0.3, front = -LD / 2;
  add(new THREE.BoxGeometry(9.4, 0.3, 8.8), plank, 0, 0.15, -0.9);                                       // floor and porch
  const lx = new THREE.CylinderGeometry(R, R, LW + 0.7, 8); lx.rotateZ(Math.PI / 2);
  const lz = new THREE.CylinderGeometry(R, R, LD + 0.7, 8); lz.rotateX(Math.PI / 2);
  const hw = (LW - 1.6) / 2, half = new THREE.CylinderGeometry(R, R, hw + 0.3, 8); half.rotateZ(Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    const yy = 0.6 + i * 0.56, m = i % 2 ? log : logD;
    add(lx, m, 0, yy, LD / 2); add(lz, m, -LW / 2, yy + 0.28, 0); add(lz, m, LW / 2, yy + 0.28, 0);
    if (i < 4) for (const s of [-1, 1]) add(half, m, s * (hw / 2 + 0.8), yy, front); else add(lx, m, 0, yy, front);  // doorway in the front wall
  }
  const sh = new THREE.Shape(); sh.moveTo(-LW / 2 - 0.9, 0); sh.lineTo(LW / 2 + 0.9, 0); sh.lineTo(0, 2.9); sh.closePath();
  const rg = new THREE.ExtrudeGeometry(sh, { depth: LD + 1.8, bevelEnabled: false }); rg.translate(0, 0, -(LD + 1.8) / 2);
  add(rg, roof, 0, 3.95, 0);
  add(new THREE.BoxGeometry(1.3, 2.3, 0.12), logD, 0.4, 1.45, front - 0.25, 0, 0.55, 0);                  // door, ajar
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(1.1, 0.9, 0.1), warm, s * 2.6, 2.0, front - 0.33);   // lit windows
  add(new THREE.BoxGeometry(1, 3.4, 1), stone, 2.6, 5.5, 1.2);                                            // chimney
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.14, 0.16, 3.1, 6), logD, s * 4.3, 1.85, front - 1.9);
  add(new THREE.BoxGeometry(9.6, 0.16, 2.6), roof, 0, 3.5, front - 1.3, 0.2, 0, 0);                       // porch roof
  // campfire
  const at = (wx, wz) => [wx, heightAt(wx, wz) - y, wz - cz];
  const [fx, fy, fz] = at(0, 5.5);
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; add(new THREE.DodecahedronGeometry(0.26, 0), stone, fx + Math.cos(a) * 0.9, fy + 0.12, fz + Math.sin(a) * 0.9); }
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 6), logD, fx, fy + 0.2, fz, 0.2, i * 2.09, 1.35);
  const fm = new THREE.MeshBasicMaterial({ color: 0xffffff }); fm.color.setRGB(4, 1.7, 0.4);
  const flame = add(new THREE.ConeGeometry(0.42, 1.2, 7), fm, fx, fy + 0.75, fz); flame.castShadow = false;
  const fire = new THREE.PointLight(0xff9a4a, 46, 26, 1.8); fire.position.set(fx, fy + 1.4, fz); g.add(fire);
  // pedestal for the character display
  const [px, py, pz] = at(-7, 8);
  add(new THREE.CylinderGeometry(1.15, 1.3, 0.4, 16), stone, px, py + 0.2, pz);
  const l1 = label('Your hunter'); l1.position.set(px, py + 2.75, pz); g.add(l1);
  // workbench
  const [bx, by, bz] = at(7, 8);
  add(new THREE.BoxGeometry(2.6, 0.16, 1.2), plank, bx, by + 1.0, bz);
  for (const [dx, dz] of [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]]) add(new THREE.BoxGeometry(0.14, 1, 0.14), logD, bx + dx, by + 0.5, bz + dz);
  add(new THREE.BoxGeometry(0.7, 0.3, 0.36), iron, bx - 0.5, by + 1.23, bz); add(new THREE.BoxGeometry(0.4, 0.18, 0.3), iron, bx - 0.5, by + 1.45, bz);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), logD, bx + 0.6, by + 1.12, bz, 0, 0.4, Math.PI / 2); add(new THREE.BoxGeometry(0.22, 0.14, 0.14), iron, bx + 0.92, by + 1.12, bz - 0.13);
  const l2 = label('Workbench · gear crafting soon', 4.4); l2.position.set(bx, by + 2.2, bz); g.add(l2);
  for (const [ox, oz, r] of [[0, cz, 4.4], [-2.7, cz, 3.6], [2.7, cz, 3.6], [-7, 8, 1.3], [7, 8, 1.5], [0, 5.5, 1.1]]) addOb(ox, oz, r);
  W.home = { flame, fire, pedestal: new THREE.Vector3(-7, heightAt(-7, 8) + 0.4, 8), fireAt: new THREE.Vector3(0, heightAt(0, 5.5) + 0.6, 5.5), chimney: new THREE.Vector3(2.6, y + 7.4, cz + 1.2) };
}

export function createWorld(scene) {
  // ---------- persistent sky & light ----------
  scene.fog = new THREE.FogExp2(0x86bfee, 0.008);
  scene.background = new THREE.Color(0x86bfee);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a3524, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sh = sun.shadow.camera;
  sh.left = -70; sh.right = 70; sh.top = 70; sh.bottom = -70; sh.near = 1; sh.far = 320;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const skyU = {
    uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() }, uCloudCol: { value: new THREE.Color() }, uTime: { value: 0 }, uNight: { value: 0 }, uCover: { value: 0.5 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 40, 20),
    new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  const windU = { value: 0 };
  const windV = { value: new THREE.Vector3(1, 0, 0.4) };  // xy = direction, z = strength
  const playerU = { value: new THREE.Vector3() };         // grass parts around the hunter
  const WIND_BASE = { home: 0.32, vale: 0.5, tundra: 0.95, wastes: 0.65 };
  let grassScale = 1;

  const W = { map: null, id: null, gates: [], liquid: null };
  let group = null, grid = new Map(), chunks = new Map(), grassGeo = null, grassMat = null, lavaMat = null, gateDiscs = [];
  const CH = 18, GR = COARSE ? 3 : 4;
  const dir = new THREE.Vector3(), tmp = new THREE.Color();
  const pal = {};
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), eul = new THREE.Euler(), ic = new THREE.Color();

  function unload() {
    if (!group) return;
    scene.remove(group);
    const seen = new Set();
    group.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      if (o.material && !seen.has(o.material)) { seen.add(o.material); o.material.dispose(); }
      if (o.isInstancedMesh) o.dispose();
    });
    chunks.clear(); grid = new Map(); gateDiscs = []; lavaMat = null; W.home = null;
  }

  W.load = (id) => {
    unload();
    const map = MAPS[id];
    W.map = map; W.id = id; W.liquid = map.liquid;
    seedOff = map.seed;
    const rng = mulberry(1337 + Math.floor(map.seed * 10));
    group = new THREE.Group(); scene.add(group);
    const L = map.liquid;

    // ---------- terrain ----------
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const wet = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      let y = rawHeight(pos.getX(i), pos.getZ(i), map.amp);
      if (y < L.level - L.bed) { y = L.level - L.bed; wet[i] = 1; }
      pos.setY(i, y); H[i] = y;
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, colors = new Float32Array(pos.count * 3);
    const cA = C(map.ground[0]), cB = C(map.ground[1]), rock = C(map.rock), dirt = C(map.dirt), shore = C(map.shore), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = vnoise(x * 0.05, z * 0.05) * 0.6 + vnoise(x * 0.31, z * 0.31) * 0.25 + vnoise(x * 1.3, z * 1.3) * 0.15;
      c.copy(cA).lerp(cB, n);
      c.lerp(dirt, clamp((1 - nrm.getY(i) - 0.05) * 6, 0, 1));
      c.lerp(rock, clamp((y - map.rockLine) / 4 + (n - 0.5) * 0.6, 0, 1));
      c.lerp(shore, wet[i] ? 1 : clamp(1 - (y - L.level) / 1.6, 0, 1) * 0.85);
      c.multiplyScalar(0.9 + vnoise(x * 2.7, z * 2.7) * 0.2);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: id === 'tundra' ? 0.75 : 0.95, metalness: 0 }));
    ground.receiveShadow = true;
    group.add(ground);

    if (L.kind === 'water' || L.kind === 'lava') {
      const mat = L.kind === 'water'
        ? new THREE.MeshStandardMaterial({ color: 0x2f7f9f, transparent: true, opacity: 0.74, roughness: 0.45, metalness: 0.1 })
        : (lavaMat = new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const liq = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), mat);
      liq.rotation.x = -Math.PI / 2; liq.position.y = L.level;
      group.add(liq);
    }

    // ---------- waygates to the other maps ----------
    W.gates = [];
    const stone = new THREE.MeshStandardMaterial({ color: id === 'wastes' ? 0x3a3432 : 0x7c7a74, roughness: 0.95, flatShading: true });
    // the cabin has a gate to every hunting ground; each hunting ground links to the others and back home
    const wild = Object.keys(MAPS).filter((k) => !MAPS[k].safe);
    (map.safe ? wild : wild.filter((k) => k !== id).concat('home')).forEach((to, gi) => {
      const [gx, gz] = GATES[gi], gy = heightAt(gx, gz);
      const g = new THREE.Group(); g.position.set(gx, gy, gz); g.rotation.y = Math.atan2(-gx, -gz);
      const col = new THREE.Color(MAPS[to].gate);
      for (const s of [-1, 1]) {
        const pil = new THREE.Mesh(jitter(new THREE.BoxGeometry(0.9, 5.2, 0.9, 2, 5, 2), 0.14), stone);
        pil.position.set(s * 2.3, 2.4, 0); pil.castShadow = true; g.add(pil);
        const rune = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.95), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.5) }));
        rune.position.set(s * 1.86, 2.6, 0); g.add(rune);
      }
      const top = new THREE.Mesh(jitter(new THREE.BoxGeometry(6.2, 0.9, 1.1, 5, 1, 2), 0.14), stone);
      top.position.y = 5.3; top.castShadow = true; g.add(top);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40),
        new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
      disc.position.y = 2.5; disc.scale.y = 1.25; g.add(disc);
      const swirl = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.7, 5, 1),
        new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(4), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, wireframe: true }));
      swirl.position.set(0, 2.5, 0.02); g.add(swirl);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 90, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      beam.position.y = 50; g.add(beam);
      group.add(g);
      gateDiscs.push(swirl);
      W.gates.push({ x: gx, z: gz, y: gy, to, name: MAPS[to].name });
    });
    const nearGate = (x, z) => GATES.some(([gx, gz]) => Math.hypot(x - gx, z - gz) < 7);
    const addOb = (x, z, r) => { const key = Math.floor(x / 8) * 4096 + Math.floor(z / 8); if (!grid.has(key)) grid.set(key, []); grid.get(key).push({ x, z, r }); };
    if (map.safe) buildCabin(group, addOb, W);

    // ---------- trees and other flora ----------
    const stdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const swayMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    swayMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windU; sh.uniforms.uWind = windV;
      sh.vertexShader = 'uniform float uTime; uniform vec3 uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 tp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float lift = max(position.y - 1.2, 0.0);
          float gst = sin(uTime * 1.1 + tp0.x * 0.21 + tp0.z * 0.17) + 0.4 * sin(uTime * 2.7 + tp0.x * 0.5);
          transformed.x += gst * uWind.z * 0.035 * lift; transformed.z += cos(uTime * 0.9 + tp0.z * 0.23) * uWind.z * 0.02 * lift;
        #endif`);
    };
    const SWAYS = { pine: 1, snowpine: 1, oak: 1, bush: 1, dead: 1, charred: 1 };
    for (const [kind, count] of map.flora) {
      const info = FLORA_INFO[kind], list = [];
      for (let a = 0; a < count * 7 && list.length < count; a++) {
        const x = (rng() - 0.5) * 850, z = (rng() - 0.5) * 850;
        if (Math.hypot(x, z) < (map.safe ? 27 : 14) || nearGate(x, z)) continue;
        if (info.forest && vnoise(x * 0.012 + 50, z * 0.012 + 50) < 0.45 + rng() * 0.13) continue;
        const y = heightAt(x, z);
        if (y > map.rockLine + 2 || y < L.level + 0.5) continue;
        list.push({ x, z, y, s: info.s[0] + rng() * (info.s[1] - info.s[0]), rot: rng() * 6.283, v: rng() });
      }
      const mat = info.glow
        ? new THREE.MeshStandardMaterial({ vertexColors: true, color: info.glow[2], emissive: info.glow[0], emissiveIntensity: info.glow[1], roughness: 0.3, flatShading: true })
        : SWAYS[kind] ? swayMat : stdMat;
      const im = new THREE.InstancedMesh(FLORA[kind](), mat, list.length);
      list.forEach((t, i) => {
        q.setFromEuler(eul.set((t.v - 0.5) * 0.12, t.rot, (rng() - 0.5) * 0.12));
        m4.compose(p.set(t.x, t.y - 0.15, t.z), q, sc.set(t.s, t.s * (0.85 + t.v * 0.35), t.s));
        im.setMatrixAt(i, m4);
        im.setColorAt(i, ic.setHSL(0, 0, 0.78 + t.v * 0.3));
        if (info.r) {
          const tr = { x: t.x, z: t.z, r: info.r * t.s };
          const key = Math.floor(t.x / 8) * 4096 + Math.floor(t.z / 8);
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(tr);
        }
      });
      im.castShadow = true; im.receiveShadow = true;
      group.add(im);
    }

    // ---------- rocks ----------
    const RN = 420;
    const rocks = new THREE.InstancedMesh(jitter(new THREE.DodecahedronGeometry(1, 1), 0.28),
      new THREE.MeshStandardMaterial({ color: map.rocks, roughness: 0.95, flatShading: true }), RN);
    for (let i = 0; i < RN; i++) {
      const x = (rng() - 0.5) * 820, z = (rng() - 0.5) * 820;
      const s = 0.25 + rng() * rng() * 2.4;
      q.setFromEuler(eul.set(rng() * 3, rng() * 3, rng() * 3));
      m4.compose(p.set(x, heightAt(x, z) + s * 0.2, z), q, sc.set(s * (0.7 + rng() * 0.6), s * (0.5 + rng() * 0.5), s));
      rocks.setMatrixAt(i, m4);
      rocks.setColorAt(i, ic.setHSL(0, 0, 0.7 + rng() * 0.45));
    }
    rocks.castShadow = true; rocks.receiveShadow = true;
    group.add(rocks);

    // ---------- grass (streamed in chunks around the player) ----------
    grassGeo = tuftGeometry(map.grass, rng);
    grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    grassMat.onBeforeCompile = (s) => {
      s.uniforms.uTime = windU; s.uniforms.uWind = windV; s.uniforms.uPlayer = playerU;
      s.vertexShader = 'uniform float uTime; uniform vec3 uWind; uniform vec3 uPlayer;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          mat3 im3 = mat3(instanceMatrix); float sc2 = dot(im3[0], im3[0]);
          float gust = 0.55 + 0.3 * sin(uTime * 1.3 + wp0.x * 0.07 + wp0.z * 0.05) + 0.25 * sin(uTime * 3.7 + wp0.x * 0.3);
          vec2 bendW = uWind.xy * uWind.z * gust * 1.5;
          vec2 aw = wp0.xz - uPlayer.xz;
          bendW += normalize(aw + 1e-4) * (1.0 - smoothstep(0.4, 1.6, length(aw))) * 1.6 * step(uPlayer.y - wp0.y, 1.2); // pushed aside as you walk through
          vec3 bl = (vec3(bendW.x, 0.0, bendW.y) * im3) / sc2; // world-space bend → this tuft's own space
          float b2 = position.y * position.y;
          transformed.xz += bl.xz * b2; transformed.y -= dot(bendW, bendW) * b2 * 0.18;
        #endif`);
      // light both faces of a blade the same (normals point straight up)
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
    };

    // ---------- top-down picture of the map for the HUD mini-map ----------
    const MS = 180, cv = document.createElement('canvas'); cv.width = cv.height = MS;
    const mctx = cv.getContext('2d'), img = mctx.createImageData(MS, MS);
    const liqC = C(L.kind === 'water' ? 0x2f7f9f : L.kind === 'ice' ? 0xa8d4ee : 0xff5a18), mc = new THREE.Color();
    for (let j = 0; j < MS; j++) for (let i = 0; i < MS; i++) {
      const x = (i / MS - 0.5) * SIZE, z = (j / MS - 0.5) * SIZE, y = heightAt(x, z);
      if (y <= L.level - L.bed + 0.05) mc.copy(liqC);
      else {
        mc.copy(cA).lerp(cB, clamp((y + map.amp * 0.5) / map.amp, 0, 1)).lerp(rock, clamp((y - map.rockLine) / 4, 0, 1));
        mc.multiplyScalar(0.75 + clamp((y - heightAt(x - 6, z - 6)) * 0.08, -0.25, 0.35)); // fake relief shading
      }
      if (Math.hypot(x, z) > WORLD_R) mc.multiplyScalar(0.3);
      const o = (j * MS + i) * 4;
      img.data[o] = Math.min(255, Math.sqrt(mc.r) * 255); img.data[o + 1] = Math.min(255, Math.sqrt(mc.g) * 255);
      img.data[o + 2] = Math.min(255, Math.sqrt(mc.b) * 255); img.data[o + 3] = 255;
    }
    mctx.putImageData(img, 0, 0);
    W.minimap = cv;

    // palette for the sky
    for (const k in map.sky) if (k !== 'cover') pal[k] = C(map.sky[k]);
    skyU.uCover.value = map.sky.cover;
    hemi.groundColor.set(map.hemiGround);
  };

  function makeChunk(cx, cz) {
    const map = W.map, n = Math.round(map.grass.density * (COARSE ? 0.45 : 1) * grassScale);
    const rng = mulberry((cx * 73856093) ^ (cz * 19349663) ^ 77);
    const im = new THREE.InstancedMesh(grassGeo, grassMat, n);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const x = (cx + rng()) * CH, z = (cz + rng()) * CH, s = 0.7 + rng() * 0.9, rot = rng() * 6.283, v = rng();
      if (vnoise(x * 0.06 + 9, z * 0.06 + 3) < 0.26) continue; // bare patches
      const y = heightAt(x, z);
      if (y < map.liquid.level + 0.25 || y > map.rockLine + 1.5) continue;
      q.setFromEuler(eul.set(0, rot, 0));
      m4.compose(p.set(x, y - 0.03, z), q, sc.set(s, s * (0.7 + v * 0.5), s));
      im.setMatrixAt(k, m4);
      im.setColorAt(k++, ic.setHSL(0.16, 0.12, 0.72 + v * 0.34));
    }
    im.count = k;
    im.receiveShadow = true;
    im.frustumCulled = true;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  }
  function streamGrass(pp) {
    const pcx = Math.floor(pp.x / CH), pcz = Math.floor(pp.z / CH);
    let made = 0;
    for (let r = 0; r <= GR && made < 2; r++) {
      for (let i = -r; i <= r && made < 2; i++) for (let j = -r; j <= r && made < 2; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r || i * i + j * j > GR * GR + 1) continue;
        const key = (pcx + i) + ',' + (pcz + j);
        if (!chunks.has(key)) { chunks.set(key, { im: makeChunk(pcx + i, pcz + j), cx: pcx + i, cz: pcz + j }); made++; }
      }
    }
    for (const [key, ch] of chunks) {
      if (Math.abs(ch.cx - pcx) > GR + 1 || Math.abs(ch.cz - pcz) > GR + 1) {
        group.remove(ch.im); ch.im.dispose(); chunks.delete(key);
      }
    }
  }

  const SUNC = C(0xfff0d8), MOONC = C(0x8fa8ff), WARM = C(0xff9a55), zen = new THREE.Color(), hor = new THREE.Color();
  /** dayT: 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight */
  W.update = (dayT, pp, time) => {
    const a = dayT * Math.PI * 2, sy = Math.sin(a);
    dir.set(Math.cos(a), sy, 0.35).normalize();
    const dayness = THREE.MathUtils.smoothstep(sy, -0.12, 0.25);
    const glow = clamp(1 - Math.abs(sy) / 0.3, 0, 1);
    zen.copy(pal.nzen).lerp(pal.zen, dayness).lerp(pal.dusk, glow * 0.12);
    hor.copy(pal.nhor).lerp(pal.hor, dayness).lerp(pal.dusk, glow * 0.6);
    skyU.uZen.value.copy(zen); skyU.uHor.value.copy(hor);
    skyU.uSunDir.value.copy(dir); skyU.uNight.value = 1 - dayness; skyU.uTime.value = time;
    skyU.uSunCol.value.copy(SUNC).lerp(WARM, glow * 0.8);
    skyU.uCloudCol.value.copy(tmp.copy(pal.nhor).multiplyScalar(1.5)).lerp(pal.cloud, dayness).lerp(pal.dusk, glow * 0.45);
    scene.background.copy(hor); scene.fog.color.copy(hor);
    scene.fog.density = W.map.fog[1] + (W.map.fog[0] - W.map.fog[1]) * dayness;
    hemi.color.copy(zen).lerp(SUNC, 0.55); hemi.intensity = 0.55 + 0.6 * dayness;
    const useSun = sy > -0.05, ld = useSun ? dir : tmpV.copy(dir).negate();
    sun.position.set(pp.x + ld.x * 140, pp.y + ld.y * 140 + 10, pp.z + ld.z * 140);
    sun.target.position.copy(pp);
    if (useSun) { sun.color.copy(SUNC).lerp(WARM, glow * 0.7); sun.intensity = 0.3 + 2.6 * dayness; }
    else { sun.color.copy(MOONC); sun.intensity = 0.55; }
    sky.position.copy(pp);
    windU.value = time;
    if (W.home) { const fl = 1 + Math.sin(time * 11) * 0.12 + Math.sin(time * 23) * 0.08; W.home.flame.scale.set(1 / fl, fl, 1 / fl); W.home.fire.intensity = 40 * fl; }
    const wa = time * 0.03 + 0.6, ws = (WIND_BASE[W.id] || 0.5) * (0.65 + 0.35 * Math.sin(time * 0.11) + 0.15 * Math.sin(time * 0.37));
    windV.value.set(Math.cos(wa), Math.sin(wa), ws); W.wind = windV.value;
    playerU.value.copy(pp);
    if (lavaMat) { const k = 1 + Math.sin(time * 1.3) * 0.18; lavaMat.color.setRGB(3.4 * k, 0.85 * k, 0.12); }
    gateDiscs.forEach((d, i) => { d.rotation.z = time * (i ? -1.1 : 1.1); d.scale.setScalar(1 + Math.sin(time * 2 + i) * 0.08); });
    streamGrass(pp);
  };
  const tmpV = new THREE.Vector3();

  /** Quality hooks: shadow map size (0 = shadows off) and grass density (0..1). */
  W.setShadow = (size) => {
    sun.castShadow = size > 0;
    if (size > 0 && sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  };
  W.setGrass = (k) => {
    if (k === grassScale) return;
    grassScale = k;
    for (const [, ch] of chunks) { group.remove(ch.im); ch.im.dispose(); }
    chunks.clear(); // chunks rebuild at the new density as they stream back in
  };
  /** Push a circle out of nearby tree trunks and rock spires. */
  W.collide = (pos, r) => {
    const cx = Math.floor(pos.x / 8), cz = Math.floor(pos.z / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = grid.get((cx + i) * 4096 + (cz + j));
      if (!list) continue;
      for (const t of list) {
        const dx = pos.x - t.x, dz = pos.z - t.z, min = r + t.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), k = (min - d) / d;
          pos.x += dx * k; pos.z += dz * k;
        }
      }
    }
  };
  return W;
}
