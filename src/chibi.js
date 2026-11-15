// Chibi character builder (≈2.2 heads tall) with anime-style toon shading.
// Adapted from the "Uji Proporsi Karakter" / "Chibi World" reference: lathe-turned torso, big head with a painted
// face texture, capsule limbs with elbow and knee joints, boots, a hair cap with locks.
// Left out on purpose, for frame rate: the inverted-hull outline on every part (doubles the draw calls),
// per-strand hair ribbons, and cloth / hair physics.
import * as THREE from 'three';

/** 'chibi' ≈ 2.2 heads. The same builder also takes 'ro' (≈ 4 heads) or 'real' (≈ 7 heads). */
export const AVATAR_KIND = 'chibi';
const PROP = {
  chibi: { heads: 2.2, height: 1.5, neck: 0.05, torso: 0.62, legs: 0.55, arm: 0.62, headSq: [1.1, 1, 1.02],
    w: { shoulder: 0.44, chest: 0.4, waist: 0.36, hip: 0.38, depth: 0.75, neck: 0.12, arm: 0.1, fore: 0.09, hand: 0.11, leg: 0.14, shin: 0.11, foot: 0.42 } },
  ro: { heads: 4.1, height: 1.75, neck: 0.18, torso: 1.38, legs: 1.62, arm: 1.5, headSq: [0.92, 1, 0.95],
    w: { shoulder: 0.74, chest: 0.66, waist: 0.48, hip: 0.5, depth: 0.62, neck: 0.21, arm: 0.15, fore: 0.13, hand: 0.16, leg: 0.21, shin: 0.16, foot: 0.62 } },
  real: { heads: 7.2, height: 1.8, neck: 0.1, torso: 2.4, legs: 3.35, arm: 3.05, headSq: [0.9, 1, 0.95],
    w: { shoulder: 0.96, chest: 0.86, waist: 0.58, hip: 0.6, depth: 0.62, neck: 0.25, arm: 0.23, fore: 0.2, hand: 0.19, leg: 0.32, shin: 0.25, foot: 0.74 } },
};
const LOOKS = {
  warrior: { skin: '#e9b48e', shirt: '#8f9bb0', pants: '#4b4440', sleeve: '#c8ced8', belt: '#6a4630', boot: '#5a3d28', hair: '#7a5236', eye: '#4a2c1c' },
  mage: { skin: '#f1c6a2', shirt: '#5a4a8a', pants: '#3a3060', sleeve: '#6a58a0', belt: '#d8b25a', boot: '#3a2c50', hair: '#e4e0da', eye: '#6a58c0' },
  archer: { skin: '#e2ad8a', shirt: '#4f7a45', pants: '#5a4a34', sleeve: '#5f8a52', belt: '#7a4e30', boot: '#6e4a2c', hair: '#d9b878', eye: '#3f6a3a' },
};

// three-step cel ramp shared by every toon material
const RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([153, 219, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
})();
/** Anime look: cel bands, cool-tinted shadows, warm rim light. */
function toon(hex, map) {
  const m = new THREE.MeshToonMaterial({ color: hex, gradientMap: RAMP, map: map || null });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', `
      float ndv = max(dot(normalize(vViewPosition), normal), 0.0);
      float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
      outgoingLight = mix(outgoingLight, outgoingLight * mix(vec3(1.0), vec3(0.42, 0.36, 1.0) * 1.25, 0.32), 1.0 - smoothstep(0.18, 0.55, lum));
      outgoingLight += vec3(1.0, 0.95, 0.88) * smoothstep(0.62, 0.9, 1.0 - ndv) * 0.3;
      #include <opaque_fragment>`);
  };
  return m;
}

function faceTex(o) {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), K = 0.5; // the reference draws at 1024x512; K scales it down
  x.fillStyle = o.skin; x.fillRect(0, 0, W, H);
  const cx = W * 0.25, ey = H * 0.6, sp = 72 * K, w = 44 * K, h = 58 * K;
  const dark = '#' + new THREE.Color(o.skin).multiplyScalar(0.72).getHexString();
  x.fillStyle = 'rgba(235,120,120,.28)';
  for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * (sp + 20 * K), ey + 44 * K, 26 * K, 12 * K, 0, 0, 6.283); x.fill(); }
  for (const s of [-1, 1]) {
    const ex = cx + s * sp;
    x.fillStyle = '#f6f1ea'; x.beginPath(); x.ellipse(ex, ey, w, h, 0, 0, 6.283); x.fill();
    const ig = x.createLinearGradient(0, ey - h, 0, ey + h);
    ig.addColorStop(0, '#' + new THREE.Color(o.eye).multiplyScalar(0.5).getHexString()); ig.addColorStop(1, o.eye);
    x.fillStyle = ig; x.beginPath(); x.ellipse(ex - s * 2 * K, ey + 4 * K, w * 0.78, h * 0.92, 0, 0, 6.283); x.fill();
    x.fillStyle = '#1d1412'; x.beginPath(); x.ellipse(ex - s * 2 * K, ey + 6 * K, w * 0.3, h * 0.42, 0, 0, 6.283); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex - s * 4 * K - 6 * K, ey - h * 0.35, 11 * K, 14 * K, 0, 0, 6.283); x.fill();
    x.beginPath(); x.ellipse(ex + 8 * K, ey + h * 0.4, 5 * K, 6 * K, 0, 0, 6.283); x.fill();
    x.strokeStyle = '#2a1a14'; x.lineCap = 'round'; x.lineWidth = 9 * K; x.beginPath(); x.ellipse(ex, ey + 6 * K, w * 1.04, h * 1.08, 0, Math.PI * 1.08, Math.PI * 1.92); x.stroke();
    x.strokeStyle = o.hair; x.lineWidth = 7 * K; x.beginPath(); const by = ey - h - 26 * K;
    x.moveTo(ex - s * w * 0.9, by + 2 * K); x.quadraticCurveTo(ex, by - 4 * K, ex + s * w * 1.1, by - 2 * K); x.stroke();
  }
  x.strokeStyle = dark; x.lineWidth = 4 * K; x.beginPath(); x.moveTo(cx + 4 * K, ey + 30 * K); x.quadraticCurveTo(cx + 10 * K, ey + 40 * K, cx + 2 * K, ey + 44 * K); x.stroke();
  x.strokeStyle = '#9b4f46'; x.lineWidth = 6 * K; x.beginPath(); const my = ey + 66 * K;
  x.moveTo(cx - 12 * K, my); x.quadraticCurveTo(cx, my + 8 * K, cx + 12 * K, my); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/**
 * Build a character for a class. `accent` colours the scarf so hunters can be told apart.
 * Faces +Z. Returns the joints needed to animate it.
 */
export function buildChibi(cls, accent, kind = AVATAR_KIND) {
  const P = PROP[kind], L = LOOKS[cls] || LOOKS.warrior, W = P.w, h = P.height / P.heads;
  const mats = new Map();
  const M = (hex) => { if (!mats.has(hex)) mats.set(hex, toon(hex)); return mats.get(hex); };
  const part = (geo, hex, parent, pos, rot, scale) => {
    const m = new THREE.Mesh(geo, typeof hex === 'string' || typeof hex === 'number' ? M(hex) : hex);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = true; parent.add(m);
    return m;
  };
  const sph = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
  const cyl = (rt, rb, hh, s = 12) => new THREE.CylinderGeometry(rt, rb, hh, s);
  const cap = (r, l) => new THREE.CapsuleGeometry(r, Math.max(0.001, l), 4, 10);
  const lathe = (pts) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), 18);

  const root = new THREE.Group();
  const legLen = P.legs * h, torsoLen = P.torso * h, armLen = P.arm * h;
  const thigh = legLen * 0.46, shin = legLen * 0.42, ankle = legLen * 0.12;
  const hips = new THREE.Group(); hips.position.y = legLen; root.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const sh = W.shoulder * h, wa = W.waist * h, hp = W.hip * h, ch = W.chest * h, nr = W.neck * h;
  const prof = [[0.001, -0.14], [hp * 0.72, -0.12], [hp, 0], [wa, 0.28], [wa * 1.02, 0.44], [ch, 0.68], [sh * 0.88, 0.86], [sh * 0.62, 0.95], [nr * 1.75, 1.0], [nr * 1.2, 1.04]].map(([r, y]) => [r, y * torsoLen]);
  const tg = lathe(prof); tg.scale(1, 1, W.depth); part(tg, L.shirt, torso);
  const pp = prof.filter((p) => p[1] <= 0.3 * torsoLen + 1e-6).map(([r, y]) => [r * 1.05, y]); pp.push([wa * 1.05, 0.3 * torsoLen]);
  const pg = lathe(pp); pg.scale(1, 1, W.depth); part(pg, L.pants, torso);
  const bg = new THREE.TorusGeometry(wa * 1.03, 0.04 * h, 6, 20); bg.rotateX(Math.PI / 2); bg.scale(1, 1, W.depth); part(bg, L.belt, torso, [0, 0.28 * torsoLen, 0]);
  part(new THREE.BoxGeometry(0.16 * h, 0.12 * h, 0.05 * h), '#d8b25a', torso, [0, 0.28 * torsoLen, wa * 1.03 * W.depth + 0.01]);
  const scarf = new THREE.TorusGeometry(nr * 1.7, 0.07 * h, 8, 18); scarf.rotateX(Math.PI / 2); part(scarf, accent, torso, [0, torsoLen * 0.98, 0]);
  part(new THREE.BoxGeometry(0.1 * h, 0.3 * h, 0.04 * h), accent, torso, [0.06 * h, torsoLen * 0.82, ch * W.depth + 0.03 * h], [0.15, 0, -0.2]);

  // neck + head
  const nk = new THREE.Group(); nk.position.y = torsoLen * 0.97; torso.add(nk);
  const neckL = P.neck * h + 0.03 * h;
  part(cyl(nr * 0.92, nr * 1.12, neckL + 0.3 * h), L.skin, nk, [0, neckL / 2, 0]);
  const head = new THREE.Group(); head.position.set(0, neckL + h * 0.45, 0); nk.add(head);
  const r = h * 0.5, sq = P.headSq;
  part(sph(r, 28, 20), toon('#ffffff', faceTex(L)), head, null, null, sq);
  for (const s of [-1, 1]) part(sph(r * 0.16, 8, 6), L.skin, head, [s * r * sq[0] * 0.97, -r * 0.08, 0], null, [0.55, 1, 0.8]);
  // hair: a cap tilted back off the face, a fringe of locks, and locks down the back
  const hr = r * Math.max(sq[0], sq[2]);
  const hc = new THREE.SphereGeometry(hr * 1.05, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.6); hc.rotateX(-0.42);
  const hm = part(hc, L.hair, head, [0, hr * 0.02, -hr * 0.03]); hm.material.side = THREE.DoubleSide;
  const lock = (az, el, len, rad, dir) => {
    const n = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(hr * 0.94);
    const g = new THREE.ConeGeometry(rad, len, 7); g.translate(0, len / 2, 0);
    const m = part(g, L.hair, head, [n.x, n.y, n.z]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()); m.scale.z = 0.55;
  };
  for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; lock(a, 0.62, hr * 0.62, hr * 0.26, [Math.sin(a) * 0.5, -1, 0.55]); }
  for (let i = 0; i < 9; i++) { const a = Math.PI + (i - 4) * 0.36; lock(a, 0.2, hr * (cls === 'archer' ? 1.0 : 0.7), hr * 0.3, [Math.sin(a) * 0.35, -1, Math.cos(a) * 0.35]); }
  if (cls === 'mage') { // pointed hat
    part(new THREE.ConeGeometry(hr * 0.8, hr * 1.7, 14), L.shirt, head, [0, hr * 1.45, -hr * 0.1], [-0.25, 0, 0]);
    const brim = new THREE.TorusGeometry(hr * 1.05, hr * 0.14, 6, 22); brim.rotateX(Math.PI / 2); part(brim, L.shirt, head, [0, hr * 0.66, -hr * 0.05], null, [1, 0.4, 1]);
    part(new THREE.TorusGeometry(hr * 0.72, hr * 0.06, 6, 18), accent, head, [0, hr * 0.8, -hr * 0.07], [Math.PI / 2 - 0.25, 0, 0]);
  } else if (cls === 'warrior') {
    for (const s of [-1, 1]) part(sph(0.2 * h, 12, 8), '#aab8c8', torso, [s * sh * 0.86, torsoLen * 0.9, 0], null, [1.15, 0.8, 1.2]); // pauldrons
  }

  const arms = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(s * sh * 0.86, torsoLen * 0.84, 0); torso.add(g);
    const ua = armLen * 0.45, fa = armLen * 0.4, rr = W.arm * h, rf = W.fore * h, hs = W.hand * h;
    part(cap(rr, ua - rr), L.sleeve, g, [0, -ua / 2, 0]);
    const el = new THREE.Group(); el.position.y = -ua; g.add(el);
    part(cap(rf, fa - rf), L.skin, el, [0, -fa / 2, 0]);
    part(cyl(rf * 1.25, rf * 1.2, fa * 0.42), L.belt, el, [0, -fa * 0.72, 0]);
    const hand = new THREE.Group(); hand.position.y = -fa; el.add(hand);
    part(sph(hs, 12, 8), L.skin, hand, [0, -hs * 0.8, hs * 0.1], null, [0.9, 1.15, 0.75]);
    return { g, el, hand, s };
  });
  const legs = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(s * hp * 0.5, 0, 0); hips.add(g);
    const rt = W.leg * h, rs = W.shin * h, bl = W.foot * h;
    part(cyl(rs * 1.12, rt, thigh), L.pants, g, [0, -thigh / 2, 0]); part(sph(rt, 12, 8), L.pants, g);
    const kn = new THREE.Group(); kn.position.y = -thigh; g.add(kn);
    part(cyl(rs * 0.86, rs * 1.05, shin), L.pants, kn, [0, -shin / 2, 0]);
    part(cyl(rs * 1.28, rs * 1.18, shin * 0.7), L.boot, kn, [0, -shin * 0.66, 0]);
    const ft = new THREE.Group(); ft.position.y = -shin; kn.add(ft);
    part(sph(1, 14, 10), L.boot, ft, [0, -ankle * 0.55, bl * 0.22], null, [bl * 0.36, ankle * 0.75, bl * 0.62]);
    part(new THREE.BoxGeometry(bl * 0.72, ankle * 0.22, bl * 1.2), '#3a2a20', ft, [0, -ankle * 0.89, bl * 0.22]);
    return { g, kn, ft, s };
  });

  // class gear in the hands
  const R = arms[1].hand, Lh = arms[0].hand, u = h;
  if (cls === 'warrior') {
    part(new THREE.BoxGeometry(0.07 * u, 0.06 * u, 1.3 * u), '#dfe6ee', R, [0, -0.12 * u, 0.75 * u]);
    part(new THREE.BoxGeometry(0.42 * u, 0.07 * u, 0.08 * u), '#d8b25a', R, [0, -0.12 * u, 0.1 * u]);
    const sg = cyl(0.5 * u, 0.5 * u, 0.07 * u, 18); sg.rotateZ(Math.PI / 2); part(sg, '#2f4f7a', Lh, [-0.14 * u, -0.1 * u, 0.02]);
    const rg = new THREE.TorusGeometry(0.5 * u, 0.04 * u, 6, 20); rg.rotateY(Math.PI / 2); part(rg, '#d8b25a', Lh, [-0.14 * u, -0.1 * u, 0.02]);
  } else if (cls === 'mage') {
    part(cyl(0.035 * u, 0.045 * u, 2.3 * u, 8), '#6b4a2c', R, [0, 0.45 * u, 0.1 * u]);
    part(new THREE.OctahedronGeometry(0.16 * u, 0), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x7fb6ff, emissiveIntensity: 3 }), R, [0, 1.75 * u, 0.1 * u], null, [1, 1.5, 1]);
  } else {
    const bow = new THREE.TorusGeometry(0.85 * u, 0.035 * u, 6, 16, Math.PI); bow.rotateZ(-Math.PI / 2); bow.rotateY(Math.PI / 2);
    part(bow, '#6b4a2c', Lh, [0, -0.1 * u, 0.1 * u]);
    part(cyl(0.006 * u, 0.006 * u, 1.7 * u, 4), '#e8e0c8', Lh, [0, -0.1 * u, 0.1 * u]);
    part(cyl(0.13 * u, 0.11 * u, 0.75 * u, 10), '#7a4e30', torso, [0.12 * u, torsoLen * 0.55, -ch * W.depth - 0.1 * u], [0, 0, 0.35]); // quiver
  }
  return { g: root, hips, torso, head, arms, legs, hipY: legLen, height: P.height, unit: h };
}
