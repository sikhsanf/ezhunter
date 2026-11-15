import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld, heightAt, WORLD_R, MAPS } from './world.js';
import { TYPES, MonsterManager } from './monsters.js';
import { Sfx } from './audio.js';
import { createCoop } from './net.js';
import { Music } from './music.js';
import { buildChibi } from './chibi.js';

const $ = (id) => document.getElementById(id);
const DAY_LEN = 300; // seconds per full day/night cycle
const EYE = 1.7;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1200);
camera.rotation.order = 'YXZ';
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.6, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

const world = createWorld(scene);
world.load('home');
const sfx = new Sfx();
const music = new Music();
try { music.muted = localStorage.getItem('ezhunter-music') === 'off'; } catch { /* storage unavailable */ }
/** Browsers only allow sound after a tap, click or key press, so the title theme starts on the first one. */
function wakeAudio() {
  sfx.init(); music.init(sfx.ctx);
  if (sfx.ctx && sfx.ctx.state !== 'running') { const p = sfx.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
}
// On touch screens only the *release* of a tap (touchend / pointerup / click) counts as permission to play sound.
for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, wakeAudio, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeAudio(); });
function toggleMusic() {
  music.setMuted(!music.muted);
  try { localStorage.setItem('ezhunter-music', music.muted ? 'off' : 'on'); } catch { /* */ }
  $('musicPill').classList.toggle('off', music.muted);
  if (game.state === 'playing') msg(music.muted ? 'Music off' : 'Music on');
}

// ---------------------------------------------------------------- game state
const player = {
  pos: new THREE.Vector3(0, heightAt(0, 0), 0), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true,
  hp: 100, maxHp: 100, stamina: 100, mana: 100, hunger: 100,
  cls: 'warrior', battle: false, stanceK: 0, blocking: false, blockK: 0, drawing: false, drawT: 0, drawK: 0, reloadT: 0, looseK: 0, autoLoose: false,
  meat: 1, essence: 0, level: 1, kills: 0, dmgMul: 1,
  staminaDelay: 0, chillT: 0, burnT: 0, torch: false, torchFuel: 120, dodgeT: 0, dodgeCd: 0, dodgeX: 0, dodgeZ: 0, stepAcc: 0, bob: 0,
};
const game = {
  player, sfx, mapId: 'home', state: 'menu', paused: false, time: 0, day: 1, isNight: false,
  hitstop: 0, shake: 0, hurtFx: 0, healFx: 0,
};
window.__game = game;

/** Three ways to hunt. Each has its own weapon, three skills (cast with E / the Cast button) and stats. */
const CLASSES = {
  warrior: {
    name: 'Warrior', hp: 130, manaRegen: 3.5, speed: 1, node: 0xffb040, range: 16,
    skills: [],
  },
  mage: {
    name: 'Mage', hp: 85, manaRegen: 6.5, speed: 1, node: 0x7fb6ff, range: 48,
    skills: [{ name: 'Firebolt', cost: 18, color: 0xff7a22 }, { name: 'Frost Nova', cost: 35, color: 0x66d8ff }, { name: 'Mend', cost: 40, color: 0x5cff8f }],
  },
  archer: {
    name: 'Archer', hp: 100, manaRegen: 3.5, speed: 1.08, node: 0x9dff6a, range: 64,
    skills: [],
  },
};
let SPELLS = CLASSES.mage.skills;
let spell = 0, castCd = 0;

// ---------------------------------------------------------------- particles
const PN = 2200;
const pPos = new Float32Array(PN * 3).fill(-9999), pCol = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3),
  pBase = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pGrav = new Float32Array(PN);
let pNext = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const dot = document.createElement('canvas'); dot.width = dot.height = 64;
{
  const c = dot.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
}
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.42, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
}));
points.frustumCulled = false;
scene.add(points);
const tc = new THREE.Color();
function burst(pos, color, n = 12, speed = 4, life = 0.6, grav = 6, spread = 0.2) {
  tc.set(color);
  for (let k = 0; k < n; k++) {
    const i = pNext; pNext = (pNext + 1) % PN;
    const th = Math.random() * 6.283, ph = Math.acos(Math.random() * 2 - 1), s = speed * (0.3 + Math.random() * 0.7);
    pPos[i * 3] = pos.x + (Math.random() - 0.5) * spread; pPos[i * 3 + 1] = pos.y + (Math.random() - 0.5) * spread; pPos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread;
    pVel[i * 3] = Math.sin(ph) * Math.cos(th) * s; pVel[i * 3 + 1] = Math.cos(ph) * s; pVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
    const b = 1.2 + Math.random() * 1.6;
    pBase[i * 3] = tc.r * b; pBase[i * 3 + 1] = tc.g * b; pBase[i * 3 + 2] = tc.b * b;
    pLife[i] = pMax[i] = life * (0.5 + Math.random() * 0.5); pGrav[i] = grav;
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PN; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -9999; continue; }
    pVel[i * 3 + 1] -= pGrav[i] * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    const f = pLife[i] / pMax[i];
    pCol[i * 3] = pBase[i * 3] * f; pCol[i * 3 + 1] = pBase[i * 3 + 1] * f; pCol[i * 3 + 2] = pBase[i * 3 + 2] * f;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// pooled flash lights (fixed count so shaders never recompile)
const flashes = [0, 1, 2].map(() => {
  const l = new THREE.PointLight(0xffffff, 0, 30, 1.6); scene.add(l);
  return { l, t: 0, max: 1, peak: 0 };
});
let flashI = 0;
function flash(pos, color, peak = 60, dur = 0.35) {
  const f = flashes[flashI]; flashI = (flashI + 1) % flashes.length;
  f.l.position.copy(pos); f.l.color.set(color); f.t = f.max = dur; f.peak = peak;
}

// ---------------------------------------------------------------- viewmodel
const vm = new THREE.Group(); camera.add(vm);
const sword = new THREE.Group(); vm.add(sword);
{
  const steel = new THREE.MeshStandardMaterial({ color: 0xcdd6e4, metalness: 0.5, roughness: 0.32 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.5, roughness: 0.4 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
  const rune = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x4ab8ff, emissiveIntensity: 2.2 });
  const add = (geo, mat, y, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.rotation.z = rz; sword.add(m); return m; };
  const shaft = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.85 });
  add(new THREE.CylinderGeometry(0.02, 0.023, 2.05, 8), shaft, 0.45);                       // shaft: butt at -0.57, head collar at 1.47
  add(new THREE.CylinderGeometry(0.027, 0.027, 0.34, 8), leather, 0);                       // grip wrap
  add(new THREE.CylinderGeometry(0.034, 0.028, 0.09, 8), gold, 1.48);
  const tip = add(new THREE.ConeGeometry(0.062, 0.44, 4), steel, 1.74); tip.scale.z = 0.4; tip.rotation.y = Math.PI / 4;
  add(new THREE.BoxGeometry(0.012, 0.2, 0.018), rune, 1.66);
  const tassel = add(new THREE.ConeGeometry(0.05, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0xb0302a, roughness: 0.9 }), 1.36); tassel.rotation.x = Math.PI;
  add(new THREE.SphereGeometry(0.034, 8, 6), gold, -0.58);
}
// Hands: jointed fingers (three phalanges each) so the right can close into a fist on the grip
// and the left can hold the spell orb in an open, cupped palm.
const HC = new THREE.CylinderGeometry(1, 1, 1, 8), HS = new THREE.SphereGeometry(1, 10, 8), BX = new THREE.BoxGeometry(1, 1, 1);
const skinM = new THREE.MeshStandardMaterial({ color: 0xc8997a, roughness: 0.75 });
const clothM = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 });
const bracerM = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.85 });
const bracerD = new THREE.MeshStandardMaterial({ color: 0x21140c, roughness: 0.85 });
const gloveM = new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 0.8 });
const studM = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.5, roughness: 0.4 });
function vp(parent, geo, mat, pos, rot, scale) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (typeof scale === 'number') m.scale.setScalar(scale); else m.scale.set(scale[0], scale[1], scale[2]);
  parent.add(m);
  return m;
}
const AX = [Math.PI / 2, 0, 0]; // lay a cylinder along Z
/** side: 1 = right hand, -1 = left. Forearm runs back along +Z, fingers reach along -Z and curl toward -Y. */
function buildHand(side, curl, thumbCurl) {
  const h = new THREE.Group(), F = [];
  vp(h, HC, clothM, [0, -0.008, 0.47], AX, [0.05, 0.36, 0.044]);                 // sleeve
  vp(h, HC, bracerM, [0, -0.004, 0.2], AX, [0.041, 0.22, 0.034]);                // bracer
  vp(h, HC, bracerD, [0, -0.004, 0.3], AX, [0.045, 0.028, 0.038]);
  vp(h, HC, bracerD, [0, -0.004, 0.1], AX, [0.04, 0.022, 0.032]);
  for (let i = 0; i < 3; i++) vp(h, HS, studM, [0, 0.031, 0.15 + i * 0.05], null, 0.007);
  vp(h, HC, skinM, [0, -0.002, 0.045], AX, [0.033, 0.1, 0.022]);                 // wrist, flattened like a real one
  vp(h, BX, skinM, [0, -0.004, -0.04], null, [0.088, 0.03, 0.092]);              // palm block, up to the knuckles
  vp(h, BX, gloveM, [0, 0.012, -0.034], null, [0.08, 0.008, 0.07]);            // glove leather across the back of the hand
  for (let i = 0; i < 4; i++) {
    const len = [0.036, 0.041, 0.039, 0.031][i];
    const k1 = new THREE.Group(); k1.position.set((i - 1.5) * 0.0235 * side, 0, -0.083 + Math.abs(i - 1.4) * 0.006);
    k1.rotation.y = (i - 1.5) * -0.07 * side; h.add(k1);
    vp(k1, HS, skinM, [0, 0.002, 0], null, 0.0138); vp(k1, HC, skinM, [0, 0, -len / 2], AX, [0.0118, len, 0.0118]);
    const k2 = new THREE.Group(); k2.position.z = -len; k1.add(k2);
    vp(k2, HS, skinM, null, null, 0.0122); vp(k2, HC, skinM, [0, 0, -len * 0.36], AX, [0.0108, len * 0.72, 0.0108]);
    const k3 = new THREE.Group(); k3.position.z = -len * 0.72; k2.add(k3);
    vp(k3, HS, skinM, null, null, 0.011); vp(k3, HC, skinM, [0, 0, -len * 0.3], AX, [0.0098, len * 0.6, 0.0098]);
    vp(k3, HS, skinM, [0, 0, -len * 0.6], null, [0.0098, 0.009, 0.011]);
    F.push([k1, k2, k3]);
  }
  vp(h, HS, skinM, [-side * 0.034, -0.012, -0.012], null, [0.02, 0.018, 0.034]); // heel of the thumb
  const t1 = new THREE.Group(); t1.position.set(-side * 0.043, -0.008, -0.022); t1.rotation.order = 'YXZ'; h.add(t1);
  vp(t1, HS, skinM, null, null, [0.0165, 0.015, 0.018]); vp(t1, HC, skinM, [0, 0, -0.018], AX, [0.0135, 0.036, 0.0135]);
  const t2 = new THREE.Group(); t2.position.z = -0.036; t1.add(t2);
  vp(t2, HS, skinM, null, null, 0.0128); vp(t2, HC, skinM, [0, 0, -0.014], AX, [0.0115, 0.028, 0.0115]); vp(t2, HS, skinM, [0, 0, -0.028], null, [0.0115, 0.0105, 0.013]);
  h.userData = { F, t1, t2, side };
  setCurl(h, curl, thumbCurl);
  return h;
}
function setCurl(h, c, tc = 0.3) {
  for (const [k1, k2, k3] of h.userData.F) { k1.rotation.x = -c * 1.35; k2.rotation.x = -c * 1.55; k3.rotation.x = -c * 1.1; }
  // open hand: thumb rests out to the side. Closing: it swings in across the front of the fingers and flexes down.
  const { t1, t2, side } = h.userData;
  t1.rotation.set(-tc * 0.8, side * (0.85 - tc * 1.2), 0); t2.rotation.set(-tc * 0.75, 0, 0);
}
// right hand: fist wrapped around the sword grip, so it follows every swing
const rHand = buildHand(1, 1, 1);
{
  const HSCALE = 1.75, f = new THREE.Vector3(0.2, -0.9, 0.35).normalize(), up = new THREE.Vector3(0, 1, 0); // forearm runs back along the shaft
  const X = up.clone().addScaledVector(f, -up.dot(f)).normalize().negate(), Y = new THREE.Vector3().crossVectors(f, X);
  rHand.scale.setScalar(HSCALE);
  rHand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, f));
  rHand.position.set(0, -0.02, 0).sub(new THREE.Vector3(0, -0.024, -0.066).multiplyScalar(HSCALE).applyQuaternion(rHand.quaternion));
  sword.add(rHand);
}
// left hand: open palm, orb floating above it
const lArm = new THREE.Group(), lHand = buildHand(-1, 0.22, 0.1);
lHand.rotation.z = Math.PI * 0.82; lArm.add(lHand); lArm.scale.setScalar(1.6); vm.add(lArm);
const orbMat = new THREE.MeshStandardMaterial({ color: 0, emissive: SPELLS[0].color, emissiveIntensity: 3 });
const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), orbMat);
orb.position.set(0, -0.095, -0.05); lHand.add(orb);
const orbRing = new THREE.Group(); orb.add(orbRing);
for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; vp(orbRing, new THREE.OctahedronGeometry(1, 0), orbMat, [Math.cos(a) * 0.055, 0, Math.sin(a) * 0.055], null, [0.005, 0.014, 0.005]); }
const orbLight = new THREE.PointLight(SPELLS[0].color, 1, 14, 1.8);
orbLight.position.set(-0.9, 0.1, -0.2);
camera.add(orbLight);

const mkPose = (p, e) => ({ p: new THREE.Vector3(...p), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2], 'YXZ')) });
// spear held low and forward; attacks are thrusts: draw back, drive out, recover
const REST = mkPose([0.4, -0.42, -0.5], [-1.2, 0.14, -0.08]);
const SWINGS = [
  [mkPose([0.5, -0.38, -0.2], [-1.42, 0.06, 0]), mkPose([0.26, -0.3, -1.15], [-1.5, 0.04, 0])],
  [mkPose([0.44, -0.3, -0.2], [-1.5, 0.3, 0.1]), mkPose([0.08, -0.28, -1.15], [-1.52, 0.2, 0.1])],
  [mkPose([0.52, -0.16, -0.05], [-1.25, 0, -0.1]), mkPose([0.22, -0.36, -1.35], [-1.62, 0, 0])],  // heavy lunge
];
// ---------- class gear: shield (warrior), staff (mage), bow (archer) ----------
const L = THREE.MathUtils.lerp;
const CN = new THREE.ConeGeometry(1, 1, 6);
const woodM = new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 0.9 });
const paleWoodM = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.8 });
const steelM = new THREE.MeshStandardMaterial({ color: 0xaab8c8, metalness: 0.5, roughness: 0.35 });
const paintM = new THREE.MeshStandardMaterial({ color: 0x2f4f7a, roughness: 0.6 });
const featherM = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 1, side: THREE.DoubleSide });
/** A hand closed around the +Y axis at its parent's origin; (fx, fy, fz) is the way the forearm runs. */
function gripHand(side, fx, fy, fz, curl = 1, thumb = 1, scale = 1.75) {
  const h = buildHand(side, curl, thumb), f = new THREE.Vector3(fx, fy, fz).normalize(), fr = f.clone();
  if (side < 0) fr.x *= -1;
  const up = new THREE.Vector3(0, 1, 0);
  const X = up.clone().addScaledVector(fr, -up.dot(fr)).normalize().negate(), Y = new THREE.Vector3().crossVectors(fr, X);
  if (side < 0) { X.x *= -1; X.negate(); Y.x *= -1; } // mirror the right-hand frame for a left hand
  h.scale.setScalar(scale);
  h.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, f));
  h.position.copy(new THREE.Vector3(0, -0.024, -0.066).multiplyScalar(scale).applyQuaternion(h.quaternion)).negate();
  return h;
}
// shield, strapped to the left forearm; we look at its wooden back
const shieldArm = new THREE.Group(); vm.add(shieldArm);
{
  const hand = buildHand(-1, 1, 1); hand.scale.setScalar(1.6); hand.rotation.z = Math.PI / 2; hand.position.set(0, -0.03, 0.08); shieldArm.add(hand);
  const sh = new THREE.Group(); sh.position.set(0, 0.04, -0.2); sh.scale.setScalar(0.78); shieldArm.add(sh);
  vp(sh, HC, woodM, [0, 0, 0.012], AX, [0.36, 0.03, 0.36]);
  vp(sh, HC, paintM, [0, 0, -0.012], AX, [0.345, 0.03, 0.345]);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.024, 8, 30), studM); sh.add(rim);
  vp(sh, HS, steelM, [0, 0, -0.035], null, [0.085, 0.085, 0.05]);
  vp(sh, BX, bracerD, [0, -0.04, 0.035], null, [0.3, 0.045, 0.012]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; vp(sh, HS, studM, [Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0.03], null, 0.014); }
}
// staff in the right hand; the left hand keeps the spell orb
const staff = new THREE.Group(); vm.add(staff);
const gemM = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff7a22, emissiveIntensity: 3 });
const gem = vp(staff, new THREE.OctahedronGeometry(1, 0), gemM, [0, 0.9, 0], null, [0.05, 0.08, 0.05]);
vp(staff, HC, woodM, [0, 0.19, 0], null, [0.019, 1.3, 0.019]);
vp(staff, HC, studM, [0, 0.76, 0], null, [0.026, 0.03, 0.026]);
vp(staff, HC, studM, [0, -0.44, 0], null, [0.024, 0.04, 0.024]);
for (let i = 0; i < 3; i++) { const a = i * 2.094; vp(staff, CN, woodM, [Math.cos(a) * 0.055, 0.86, Math.sin(a) * 0.055], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], [0.013, 0.2, 0.013]); }
staff.add(gripHand(1, 0.15, -0.6, 0.8));
const STAFF_REST = mkPose([0.42, -0.42, -0.72], [-0.28, 0.15, -0.1]), STAFF_CAST = mkPose([0.33, -0.3, -0.86], [-1.0, 0.05, -0.05]);
// bow in the left hand, arrow on the string, right hand drawing
const bowArm = new THREE.Group(); vm.add(bowArm);
const TIP = 0.58, TIPZ = 0.07, NOCK0 = 0.07;
bowArm.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -TIP, TIPZ), new THREE.Vector3(0, 0, -0.22), new THREE.Vector3(0, TIP, TIPZ)), 24, 0.014, 6), woodM));
vp(bowArm, HC, bracerD, [0, 0, -0.075], null, [0.02, 0.17, 0.02]);
for (const sy of [-1, 1]) vp(bowArm, HS, studM, [0, sy * TIP, TIPZ], null, 0.018);
const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -TIP, TIPZ), new THREE.Vector3(0, 0, NOCK0), new THREE.Vector3(0, TIP, TIPZ)]);
bowArm.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xe8e0c8 })));
{ const h = gripHand(-1, -0.1, -0.35, 0.9); h.position.z -= 0.075; bowArm.add(h); }
const nock = new THREE.Group(); nock.position.z = NOCK0; bowArm.add(nock); // slides back as you draw
const nockArrow = new THREE.Group(); nockArrow.position.x = 0.018; nock.add(nockArrow);
vp(nockArrow, HC, paleWoodM, [0, 0, -0.4], AX, [0.006, 0.8, 0.006]);
vp(nockArrow, CN, steelM, [0, 0, -0.83], [-Math.PI / 2, 0, 0], [0.016, 0.07, 0.016]);
for (let i = 0; i < 3; i++) { const a = i * 2.094; vp(nockArrow, BX, featherM, [Math.cos(a) * 0.013, Math.sin(a) * 0.013, -0.06], [0, 0, a], [0.026, 0.002, 0.09]); }
nock.add(gripHand(1, 0.8, -0.25, 0.55, 0.85, 1, 1.25));
// a hand that brings a piece of meat up to eat
const eatArm = new THREE.Group(); eatArm.visible = false; vm.add(eatArm);
{
  const h = buildHand(1, 0.85, 0.9); h.scale.setScalar(1.6); eatArm.add(h);
  const meat = new THREE.Group(); meat.position.set(0, -0.02, -0.12); meat.rotation.x = -0.5; eatArm.add(meat);
  vp(meat, HC, new THREE.MeshStandardMaterial({ color: 0xeee6d2, roughness: 0.6 }), [0, -0.06, 0], null, [0.014, 0.2, 0.014]);
  vp(meat, HS, new THREE.MeshStandardMaterial({ color: 0xeee6d2, roughness: 0.6 }), [0, -0.17, 0], null, [0.028, 0.02, 0.022]);
  vp(meat, HS, new THREE.MeshStandardMaterial({ color: 0xa8482c, roughness: 0.55, emissive: 0x3a0f08 }), [0, 0.07, 0], null, [0.05, 0.07, 0.046]);
}
// a torch for the night
const torchVM = new THREE.Group(); torchVM.visible = false; torchVM.rotation.set(0.25, 0, 0.3); vm.add(torchVM);
vp(torchVM, HC, woodM, [0, -0.1, 0], null, [0.018, 0.46, 0.018]);
vp(torchVM, HC, bracerD, [0, 0.13, 0], null, [0.03, 0.09, 0.03]);
const torchFlameM = new THREE.MeshBasicMaterial({ color: 0xffffff }); torchFlameM.color.setRGB(4, 1.9, 0.5);
const torchFlame = vp(torchVM, CN, torchFlameM, [0, 0.27, 0], null, [0.042, 0.2, 0.042]);
const TORCH_MAX = 120; // seconds of light
function toggleTorch() {
  const p = player;
  if (game.state !== 'playing') return;
  if (!p.torch && p.torchFuel < 3) { msg('The torch is burnt out. It recovers slowly, or at once at your cabin'); sfx.deny(); return; }
  p.torch = !p.torch; sfx.torch();
}
const BOW_REST = { p: [-0.1, -0.36, -0.8], r: [0, 0.12, -0.6] }, BOW_DRAW = { p: [-0.2, -0.24, -0.98], r: [0, 0.1, -0.38] };
let staffKick = 0, staffCd = 0, shieldKick = 0;

function updateViewmodel(dt, hs) {
  const p = player, t = game.time, c = p.cls;
  p.stanceK += ((p.battle ? 1 : 0) - p.stanceK) * Math.min(1, dt * 9);
  let eatU = 0;
  if (p.eatT > 0) {
    p.eatT += dt / 1.4;
    if (!p.eatBit && p.eatT > 0.45) {
      p.eatBit = true; p.meat = Math.max(0, p.meat - 1);
      p.hunger = Math.min(100, p.hunger + 34); p.hp = Math.min(p.maxHp, p.hp + 10); sfx.eat();
      lookDir(v1); v2.set(p.pos.x, p.pos.y + EYE - 0.25, p.pos.z).addScaledVector(v1, 0.6); burst(v2, 0xc9764a, 8, 1.4, 0.5, 9);
    }
    if (p.eatBit && p.eatT > 0.62 && p.eatT < 0.66) sfx.eat();
    eatU = Math.min(1, p.eatT / 0.22) * (p.eatT > 0.8 ? Math.max(0, (1 - p.eatT) / 0.2) : 1);
    const chew = p.eatT > 0.3 && p.eatT < 0.8 ? Math.sin(p.eatT * 42) * 0.018 : 0;
    eatArm.position.set(0.3 - eatU * 0.1, -1.1 + eatU * 0.7 + chew, -0.55 + eatU * 0.08);
    eatArm.rotation.set(0.35 + eatU * 0.75, -0.3, 0.2);
    if (p.eatT >= 1) p.eatT = 0;
  }
  eatArm.visible = p.eatT > 0;
  const k = p.stanceK, low = (1 - k) * 0.95 + eatU * 0.7, shown = k > 0.03;
  const sway = Math.sin(p.bob) * 0.012 * Math.min(1, hs / 6);
  vm.position.set(sway, Math.abs(Math.cos(p.bob)) * 0.012 * Math.min(1, hs / 6) - (p.onGround ? 0 : 0.02), 0);
  sword.visible = shieldArm.visible = c === 'warrior' && shown;
  staff.visible = c === 'mage' && shown; lArm.visible = false; // the mage fights with the staff alone
  bowArm.visible = c === 'archer' && shown;
  orbKick = Math.max(0, orbKick - dt * 4); staffKick = Math.max(0, staffKick - dt * 4.5); shieldKick = Math.max(0, shieldKick - dt * 4);
  const col = SPELLS[spell] ? SPELLS[spell].color : 0xffe2b8;
  if (c === 'warrior') {
    const b = p.blockK, sk = Math.sin(shieldKick * Math.PI);
    poseSword();
    sword.position.x += b * 0.22; sword.position.y -= low + b * 1.15; sword.position.z += b * 0.3; // sword hand held low and back
    shieldArm.position.set(L(-0.52, -0.01, b), L(-0.52, -0.2, b) - low, L(-0.62, -0.42, b) - sk * 0.35);
    shieldArm.rotation.set(L(0.1, -0.06, b) + sk * 0.2, L(0.6, 0, b), L(0.18, 0, b));
    const age = t - (game.shieldHit ?? -9);
    if (age >= 0 && age < 0.7) { // blocked blow: knocked back toward you, then a damped bounce
      const rc = Math.exp(-6.5 * age) * Math.cos(19 * age);
      shieldArm.position.z += rc * 0.2; shieldArm.position.y -= rc * 0.05; shieldArm.rotation.x += rc * 0.3; shieldArm.rotation.z += rc * 0.08;
    }
  } else if (c === 'mage') {
    const a = Math.sin(Math.max(staffKick, orbKick * 0.7) * Math.PI);
    staff.position.lerpVectors(STAFF_REST.p, STAFF_CAST.p, a); staff.position.y -= low;
    staff.quaternion.slerpQuaternions(STAFF_REST.q, STAFF_CAST.q, a);
    gem.rotation.y = t * 2; gemM.emissive.set(col); gemM.emissiveIntensity = 2.2 + Math.sin(t * 5) * 0.4 + a * 4;
    const kick = Math.sin(orbKick * Math.PI);
    lArm.position.set(-0.44 + kick * 0.1, -0.4 + Math.sin(t * 1.6) * 0.006 + kick * 0.12 - low, -0.72 - kick * 0.28);
    lArm.rotation.set(0.35 + kick * 0.5, 0.3, -0.15);
    setCurl(lHand, 0.22 - kick * 0.2, 0.1);
    orb.rotation.set(t, t * 1.3, 0); orbRing.rotation.y = t * 3; orb.position.y = -0.095 + Math.sin(t * 2.3) * 0.006;
    orbMat.emissiveIntensity = 1.5 + Math.sin(t * 5) * 0.25 + orbKick * 5 - (p.mana < SPELLS[spell].cost ? 1.2 : 0);
  } else {
    // draw: the string hand pulls back while the bow comes up; loose: the string snaps and the bow kicks;
    // then the hand dips for a fresh arrow and sets it on the string
    const want = p.drawing ? Math.min(1, p.drawT / 0.75) : 0;
    p.drawK += (want - p.drawK) * Math.min(1, dt * (p.drawing ? 14 : 40));
    p.looseK = Math.max(0, p.looseK - dt * 3.2);
    const d = p.drawK, e = d * d * (3 - 2 * d), lk = p.looseK, snap = lk * lk;
    const re = p.reloadT > 0 ? 1 - p.reloadT / RELOAD : 1, dip = Math.sin(re * Math.PI); // 0→1 through the re-nock
    bowArm.position.set(L(BOW_REST.p[0], BOW_DRAW.p[0], e), L(BOW_REST.p[1], BOW_DRAW.p[1], e) - low + snap * 0.03, L(BOW_REST.p[2], BOW_DRAW.p[2], e) - snap * 0.09);
    bowArm.rotation.set(-snap * 0.12, L(BOW_REST.r[1], BOW_DRAW.r[1], e), L(BOW_REST.r[2], BOW_DRAW.r[2], e) + (d >= 0.99 ? Math.sin(t * 40) * 0.004 : 0) - snap * 0.1);
    const pull = NOCK0 + e * 0.38;
    const sz = pull + (lk > 0 ? Math.sin(lk * 28) * 0.035 * lk : 0); // string twangs after the loose
    stringGeo.attributes.position.setZ(1, sz); stringGeo.attributes.position.needsUpdate = true;
    nock.position.set(dip * 0.2, -dip * 0.24, pull + dip * 0.22);
    nock.rotation.z = -dip * 0.5;
    nockArrow.visible = re > 0.45;
  }
  torchVM.visible = p.torch;
  if (p.torch) { // a lit torch: one warm, far-reaching light (reuses the hand light, so no extra lights to pay for)
    const fl = 1 + Math.sin(t * 13) * 0.07 + Math.sin(t * 29) * 0.05;
    torchVM.position.set(-0.52, -0.42 - eatU * 0.5, -0.72); torchFlame.scale.set(1 / fl, fl, 1 / fl);
    orbLight.color.set(0xffb060); orbLight.distance = 38; orbLight.intensity = 26 * fl * Math.min(1, p.torchFuel / 8);
  } else {
    orbLight.distance = 14; orbLight.color.set(c === 'mage' ? col : 0xffe2b8);
    orbLight.intensity = (game.isNight ? 2.2 : 0.8) * (c === 'mage' ? 1 : 0.6) * k + orbKick * 6;
  }
}

const swing = { active: false, t: 0, type: 0, dur: 0.42, hitDone: false, queued: false, combo: 0, comboT: 0 };
let orbKick = 0;
const ease = (x) => x * x * (3 - 2 * x);
function poseSword() {
  if (!swing.active) { sword.position.copy(REST.p); sword.quaternion.copy(REST.q); return; }
  const p = swing.t / swing.dur, [a, b] = SWINGS[swing.type];
  let from, to, k;
  if (p < 0.28) { from = REST; to = a; k = ease(p / 0.28); }
  else if (p < 0.55) { from = a; to = b; k = (p - 0.28) / 0.27; k = 1 - (1 - k) * (1 - k); }
  else { from = b; to = REST; k = ease((p - 0.55) / 0.45); }
  sword.position.lerpVectors(from.p, to.p, k);
  sword.quaternion.slerpQuaternions(from.q, to.q, k);
}

// ---------------------------------------------------------------- projectiles, loot, effects
const boltGeo = new THREE.SphereGeometry(0.22, 10, 8);
const boltMatP = new THREE.MeshBasicMaterial({ color: 0xffffff }); boltMatP.color.setRGB(5, 2, 0.5);
const boltMatE = new THREE.MeshBasicMaterial({ color: 0xffffff }); boltMatE.color.setRGB(5, 0.9, 0.3);
const bolts = [];
const boltMats = {};
function boltMat(color) {
  if (!boltMats[color]) { const m = new THREE.MeshBasicMaterial({ color }); m.color.multiplyScalar(5); boltMats[color] = m; }
  return boltMats[color];
}
function spawnBolt(origin, dir, speed, dmg, owner, name, color, effect) {
  const mesh = new THREE.Mesh(boltGeo, owner === 'player' ? boltMatP : color ? boltMat(color) : boltMatE);
  mesh.position.copy(origin); scene.add(mesh);
  bolts.push({ mesh, vel: dir.clone().multiplyScalar(speed), life: 4, dmg, owner, name, color: color || 0xff3a18, effect });
}
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
function enemyShot(from, vel, dmg, name, color, effect) {
  spawnBolt(from, vel.clone().normalize(), vel.length(), dmg, 'enemy', name, color, effect);
  flash(from, color, 30, 0.25); sfx.fire();
}
game.enemyBolt = (from, dmg, name, color = 0xff5a18, effect, tgt = player) => {
  v1.set(tgt.pos.x, tgt.pos.y + 1.2, tgt.pos.z).sub(from).normalize().multiplyScalar(19);
  enemyShot(from, v1, dmg, name, color, effect);
  if (coop.role === 'host') coop.enemyBolt(from, v1, dmg, name, color, effect);
};
function explode(pos, dmg, direct) {
  burst(pos, 0xff7a22, 46, 9, 0.7, 5); burst(pos, 0xffd27a, 16, 4, 0.4, 0);
  if (pos.y - heightAt(pos.x, pos.z) < 2.5) { addMark('fire', pos.x, pos.z, 3.6, 8); zones.push({ kind: 'fire', x: pos.x, z: pos.z, r: 3, t: 4, tick: 0.3 }); } // the ground keeps burning
  flash(pos, 0xff8a33, 140, 0.45); sfx.boom();
  game.shake = Math.max(game.shake, 0.25);
  for (const m of monsters.list) {
    if (m.dead) continue;
    const d = m.center.distanceTo(pos);
    if (m === direct) hitMonster(m, dmg, 1.5);
    else if (d < 4.6 + m.def.radius) hitMonster(m, dmg * 0.55, 1);
  }
}
const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
let ringT = 0, ringR = 1;
function showRing(x, y, z, r, color) {
  ring.position.set(x, y + 0.25, z); ring.material.color.set(color).multiplyScalar(2.5); ringT = 0.5; ringR = r; ring.visible = true;
}

// ---------- mage marks: scorched, burning ground and frozen ground ----------
function markTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  if (kind === 'fire') {
    g.addColorStop(0, 'rgba(12,6,3,.92)'); g.addColorStop(0.45, 'rgba(26,12,6,.8)'); g.addColorStop(0.8, 'rgba(60,24,8,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.lineCap = 'round';
    for (let i = 0; i < 26; i++) { // glowing cracks
      const a = Math.random() * 6.283, r0 = 10 + Math.random() * 40, r1 = r0 + 20 + Math.random() * 55;
      x.strokeStyle = `rgba(255,${120 + Math.random() * 90 | 0},30,${0.5 + Math.random() * 0.4})`; x.lineWidth = 1.5 + Math.random() * 3;
      x.beginPath(); x.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); x.lineTo(128 + Math.cos(a + 0.25) * (r0 + r1) / 2, 128 + Math.sin(a + 0.25) * (r0 + r1) / 2); x.lineTo(128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1); x.stroke();
    }
  } else if (kind === 'ice') {
    g.addColorStop(0, 'rgba(235,250,255,.75)'); g.addColorStop(0.6, 'rgba(150,215,255,.55)'); g.addColorStop(0.92, 'rgba(120,200,255,.5)'); g.addColorStop(1, 'rgba(120,200,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineCap = 'round';
    for (let i = 0; i < 12; i++) { // frost crystal arms with side branches
      const a = i / 12 * 6.283 + Math.random() * 0.2, L = 70 + Math.random() * 50;
      x.lineWidth = 2.5; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a) * L, 128 + Math.sin(a) * L); x.stroke();
      x.lineWidth = 1.5;
      for (let k = 1; k < 4; k++) for (const sd of [-1, 1]) { const bx = 128 + Math.cos(a) * L * k / 4, by = 128 + Math.sin(a) * L * k / 4; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(a + sd * 0.9) * 16, by + Math.sin(a + sd * 0.9) * 16); x.stroke(); }
    }
  } else {
    g.addColorStop(0, 'rgba(120,255,160,.35)'); g.addColorStop(0.85, 'rgba(90,255,140,.3)'); g.addColorStop(1, 'rgba(90,255,140,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(200,255,215,.9)'; x.lineWidth = 4;
    for (const r of [112, 84]) { x.beginPath(); x.arc(128, 128, r, 0, 6.283); x.stroke(); }
    x.lineWidth = 3; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; x.beginPath(); x.moveTo(128 + Math.cos(a) * 84, 128 + Math.sin(a) * 84); x.lineTo(128 + Math.cos(a + 2.094) * 84, 128 + Math.sin(a + 2.094) * 84); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const MARK_TEX = { fire: markTex('fire'), ice: markTex('ice'), heal: markTex('heal') };
const marks = [0, 1, 2, 3, 4, 5].map(() => {
  const geo = new THREE.PlaneGeometry(1, 1, 10, 10); geo.rotateX(-Math.PI / 2);
  const base = geo.attributes.position.array.slice();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2; scene.add(mesh);
  return { mesh, geo, base, t: 0, life: 1 };
});
let markI = 0;
/** Lay a mark on the ground, draped over the terrain. */
function addMark(kind, x, z, r, life) {
  const m = marks[markI]; markI = (markI + 1) % marks.length;
  const a = m.geo.attributes.position;
  for (let i = 0; i < a.count; i++) { const wx = x + m.base[i * 3] * 2 * r, wz = z + m.base[i * 3 + 2] * 2 * r; a.setXYZ(i, wx, heightAt(wx, wz) + 0.09, wz); }
  a.needsUpdate = true;
  m.mesh.material.map = MARK_TEX[kind]; m.mesh.material.needsUpdate = true;
  m.mesh.material.color.setScalar(kind === 'heal' ? 1.6 : 1); m.maxO = kind === 'ice' ? 0.6 : 1;
  m.t = m.life = life; m.mesh.visible = true;
}
// ice shards that jut up around a Frost Nova
const shardMat = new THREE.MeshStandardMaterial({ color: 0xcfeeff, emissive: 0x3aa0ff, emissiveIntensity: 1.1, roughness: 0.2, transparent: true, opacity: 0.85, flatShading: true });
const shards = Array.from({ length: 14 }, () => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.9, 5), shardMat); m.visible = false; scene.add(m); return m; });
let shardT = 0, shardLife = 1;
function raiseShards(x, z, r, life) {
  shards.forEach((m, i) => {
    const a = i / shards.length * 6.283 + Math.random() * 0.3, rr = r * (0.45 + Math.random() * 0.5), sx = x + Math.cos(a) * rr, sz = z + Math.sin(a) * rr;
    m.position.set(sx, heightAt(sx, sz), sz); m.rotation.set((Math.random() - 0.5) * 0.7, Math.random() * 6, (Math.random() - 0.5) * 0.7);
    m.userData.h = 0.7 + Math.random() * 1.1; m.visible = true;
  });
  shardT = shardLife = life;
}
const zones = []; // lingering spell areas: { kind, x, z, r, t, tick }
function updateMarks(dt) {
  for (const m of marks) {
    if (m.t <= 0) continue;
    m.t -= dt;
    m.mesh.material.opacity = Math.min(1, m.t / 1.2, (m.life - m.t) / 0.15) * (m.maxO || 1);
    if (m.t <= 0) m.mesh.visible = false;
  }
  if (shardT > 0) {
    shardT -= dt;
    const up = Math.min(1, (shardLife - shardT) / 0.18), down = Math.min(1, Math.max(0, shardT) / 0.8);
    for (const m of shards) { const s = m.userData.h * up * down; m.scale.set(s, s, s); m.position.y = heightAt(m.position.x, m.position.z) + 0.95 * s - 0.1; if (shardT <= 0) m.visible = false; }
  }
  for (let i = zones.length - 1; i >= 0; i--) {
    const zn = zones[i];
    zn.t -= dt; zn.tick -= dt;
    const fire = zn.kind === 'fire';
    for (let k = 0; k < (fire ? 3 : 1); k++) { // flames lick up from the scorch; frost glitters
      const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * zn.r, px = zn.x + Math.cos(a) * rr, pz = zn.z + Math.sin(a) * rr;
      v2.set(px, heightAt(px, pz) + 0.15, pz);
      if (fire) burst(v2, Math.random() < 0.3 ? 0xffd27a : 0xff6a18, 1, 0.5, 0.75, -4.5, 0.2); else if (Math.random() < 0.5) burst(v2, 0xbfeaff, 1, 0.3, 0.9, -0.6, 0.1);
    }
    if (zn.tick <= 0) {
      zn.tick = 0.5;
      for (const m of monsters.list) {
        if (m.dead || Math.hypot(m.pos.x - zn.x, m.pos.z - zn.z) > zn.r + m.def.radius) continue;
        if (fire) hitMonster(m, 4, 0); else hitMonster(m, 1, 0, { slow: 1.4 });
      }
    }
    if (zn.t <= 0) zones.splice(i, 1);
  }
}
// ---------- water ripples: a small pool of expanding rings ----------
const ripples = [0, 1, 2, 3, 4, 5, 6, 7].map(() => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 28), new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 3; scene.add(m);
  return { m, t: 0, str: 1 };
});
let ripI = 0, ripT = 0;
function addRipple(x, z, str = 1) {
  const r = ripples[ripI]; ripI = (ripI + 1) % ripples.length;
  r.m.position.set(x, world.liquid.level + 0.03, z); r.t = 1; r.str = str; r.m.visible = true;
}
function updateRipples(dt) {
  for (const r of ripples) {
    if (r.t <= 0) continue;
    r.t -= dt * 0.75;
    const a = 1 - r.t;
    r.m.scale.setScalar(0.3 + a * 2.6 * r.str); r.m.material.opacity = Math.max(0, r.t) * 0.55;
    if (r.t <= 0) r.m.visible = false;
  }
  if (world.liquid.kind !== 'water') return;
  ripT -= dt;
  if (ripT > 0) return;
  ripT = 0.28;
  const p = player, lv = world.liquid.level;
  if (p.inWater && p.onGround) { // wading
    const sp = Math.hypot(p.vel.x, p.vel.z);
    addRipple(p.pos.x + (Math.random() - 0.5) * 0.3, p.pos.z + (Math.random() - 0.5) * 0.3, sp > 0.5 ? Math.min(1.2, 0.4 + sp / 7) : 0.3);
    if (sp > 5) { v2.set(p.pos.x, lv, p.pos.z); burst(v2, 0xcfe8ff, 5, 2.2, 0.4, 10); }
  }
  for (const m of monsters.list) { // creatures splashing through the shallows
    if (m.dead || m.def.hover || m.dist > 45 || m.pos.y > lv - 0.05 || Math.random() < 0.5) continue;
    addRipple(m.pos.x, m.pos.z, 0.5 + m.def.radius * 0.4);
  }
}
// ---------- arrow arc: where the shot will fly while the bow is drawn ----------
const TRAJ_N = 26, trajGeo = new THREE.BufferGeometry();
trajGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAJ_N * 3), 3));
const trajLine = new THREE.Line(trajGeo, new THREE.LineDashedMaterial({ color: 0xffe9a8, dashSize: 0.5, gapSize: 0.45, transparent: true, opacity: 0.75, depthWrite: false }));
trajLine.frustumCulled = false; trajLine.visible = false; scene.add(trajLine);
const tv = new THREE.Vector3(), tp = new THREE.Vector3();
function updateTrajectory() {
  const p = player;
  trajLine.visible = p.cls === 'archer' && p.drawing && p.drawT > 0.12;
  if (!trajLine.visible) return;
  const power = Math.max(0.3, Math.min(1, p.drawT / 0.75)), speed = 45 + 35 * power, a = trajGeo.attributes.position;
  lookDir(tv);
  tp.set(p.pos.x, p.pos.y + EYE - 0.12, p.pos.z).addScaledVector(tv, 0.9);
  aimDir(tp, tv).multiplyScalar(speed);
  let n = 0;
  for (; n < TRAJ_N; n++) {
    a.setXYZ(n, tp.x, tp.y, tp.z);
    if (tp.y < heightAt(tp.x, tp.z)) { n++; break; }
    tv.y -= 5 * 0.07; tp.addScaledVector(tv, 0.07); // same gravity the arrow gets
  }
  for (let i = n; i < TRAJ_N; i++) a.setXYZ(i, tp.x, tp.y, tp.z);
  a.needsUpdate = true; trajLine.computeLineDistances();
}
const loot = [];
const meatGeo = new THREE.BoxGeometry(0.34, 0.22, 0.26), essGeo = new THREE.OctahedronGeometry(0.16, 0);
const meatMat = new THREE.MeshStandardMaterial({ color: 0xa8382c, roughness: 0.6, emissive: 0x4a0d08 });
const essMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0x52e6ff, emissiveIntensity: 3.5 });
function dropLoot(pos, kind, value) {
  const mesh = new THREE.Mesh(kind === 'meat' ? meatGeo : essGeo, kind === 'meat' ? meatMat : essMat);
  mesh.position.set(pos.x + (Math.random() - 0.5) * 1.5, 0, pos.z + (Math.random() - 0.5) * 1.5);
  mesh.position.y = heightAt(mesh.position.x, mesh.position.z) + 0.6;
  scene.add(mesh);
  loot.push({ mesh, kind, value, t: Math.random() * 6, age: 0 });
}

// ---------------------------------------------------------------- combat
function hitMonster(m, dmg, kb, opt) {
  const dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
  if (player.battle && !game.lockOff && (!game.lock || game.lock.dead)) game.lock = m;
  const amount = dmg * player.dmgMul * (0.9 + Math.random() * 0.2);
  floatText(Math.round(amount), m.center, m.def.height, amount >= 30 * player.dmgMul);
  if (opt && opt.slow) m.slowT = opt.slow;
  if (coop.mirror) { // the host owns this creature: tell it, and show the hit right away
    coop.sendHit(m, amount, kb, opt);
    m.flashT = 0.12; m.hp = Math.max(1, m.hp - amount); m.showBar();
  } else {
    if (opt && opt.stun && m.def.mass < 1 && m.state !== 'wander' && m.state !== 'flee') { m.state = 'recover'; m.timer = 1.2; }
    m.takeDamage(amount, game, dx / d, dz / d, kb);
  }
  $('cross').classList.add('hit'); setTimeout(() => $('cross').classList.remove('hit'), 110);
}
game.onKill = (m) => {
  player.kills++;
  for (let i = 0; i < m.def.meat; i++) dropLoot(m.pos, 'meat', 1);
  dropLoot(m.pos, 'essence', m.def.essence);
  burst(m.center, 0xff4422, 26, 6, 0.7, 9);
  msg(`${m.def.name} slain`);
};
game.burst = burst;
game.damagePlayer = (dmg, from, name, kb = 6, effect) => {
  if (game.state !== 'playing' || player.dodgeT > 0 || game.travelling) return false;
  if (player.blocking && from) { // shield up and facing the blow
    const bx = from.x - player.pos.x, bz = from.z - player.pos.z, bl = Math.hypot(bx, bz) || 1;
    if ((-Math.sin(player.yaw) * bx - Math.cos(player.yaw) * bz) / bl > 0.2) {
      const held = player.stamina > 0;
      player.stamina = Math.max(0, player.stamina - dmg * 0.7); player.staminaDelay = 1;
      dmg *= held ? 0.2 : 0.6; kb *= 0.3; effect = undefined; game.shieldHit = game.time; // the shield is driven back and springs forward again
      camera.getWorldDirection(v1); v2.copy(camera.position).addScaledVector(v1, 0.9); v2.y -= 0.3;
      burst(v2, 0xffe9a8, 14, 5, 0.3, 8); sfx.block();
      if (!held) msg('Guard broken!');
    }
  }
  player.hp -= dmg;
  if (effect === 'chill') { player.chillT = 3; if (!game.chillTold) { game.chillTold = true; msg('Chilled — you move slower'); } }
  else if (effect === 'burn') { player.burnT = 3; if (!game.burnTold) { game.burnTold = true; msg('Burning!'); } }
  game.hurtFx = 1; game.shake = Math.max(game.shake, 0.5); sfx.hurt();
  const dx = player.pos.x - from.x, dz = player.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
  player.vel.x += dx / d * kb; player.vel.z += dz / d * kb;
  if (player.hp <= 0) die(`Slain by a ${name}`);
  return true;
};
game.slam = (x, z, r, dmg, name, from, effect) => {
  localSlam(x, z, r, dmg, name, from, effect);
  if (coop.role === 'host') coop.slam(x, z, r, dmg, name, from, effect);
};
function localSlam(x, z, r, dmg, name, from, effect) {
  const y = heightAt(x, z);
  v1.set(x, y + 0.3, z);
  const dust = effect === 'chill' ? 0x8fe6ff : effect === 'burn' ? 0xff5a18 : 0xb89a6a;
  burst(v1, dust, 50, 9, 0.8, 12, 2); showRing(x, y, z, r, effect === 'chill' ? 0x66d8ff : 0xff9a4a); sfx.slam();
  const d = Math.hypot(player.pos.x - x, player.pos.z - z);
  if (d < 22) game.shake = Math.max(game.shake, 0.7 * (1 - d / 22));
  if (d < r && player.pos.y - heightAt(player.pos.x, player.pos.z) < 1) game.damagePlayer(dmg, from, name, 13, effect);
}
/** Which hunter a monster goes for: the nearest one in this map. */
game.pickTarget = (m) => {
  let best = player, bd = Infinity;
  for (const t of coop.targets()) {
    if (t === player && game.state !== 'playing') continue;
    const d = Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
};
game.damageTarget = (tgt, dmg, from, name, kb, effect) => {
  if (tgt === player) game.damagePlayer(dmg, from, name, kb, effect);
  else coop.hurt(tgt, dmg, from, name, kb, effect); // that hunter's own device decides if they dodged or blocked
};
game.anchors = () => coop.targets().map((t) => t.pos);
/** Another hunter's arrow or spell: shown here, but it deals no damage on this device. */
function ghostShot(kind, origin, vel) {
  let mesh;
  if (kind === 'arrow') { mesh = new THREE.Group(); vp(mesh, HC, arrowM, null, AX, [0.012, 0.9, 0.012]); vp(mesh, CN, steelM, [0, 0, 0.5], [Math.PI / 2, 0, 0], [0.035, 0.12, 0.035]); }
  else { mesh = new THREE.Mesh(boltGeo, kind === 'arcane' ? boltMat(0x9a7aff) : boltMatP); if (kind === 'arcane') mesh.scale.setScalar(0.6); }
  mesh.position.copy(origin); scene.add(mesh);
  bolts.push({ mesh, vel, life: 2.5, dmg: 0, owner: 'ghost', kind, grav: kind === 'arrow' ? 5 : 0, color: kind === 'arcane' ? 0x9a7aff : 0xff7a22 });
}

function startSwing() {
  if (player.stamina < 6) { sfx.deny(); return; }
  swing.active = true; swing.t = 0; swing.hitDone = false; swing.queued = false;
  swing.type = swing.combo % 3; swing.dur = swing.type === 2 ? 0.52 : 0.4;
  swing.combo++; swing.comboT = 1.1; player.atkSeq = (player.atkSeq || 0) + 1;
  player.stamina -= swing.type === 2 ? 11 : 7; player.staminaDelay = 0.6;
  sfx.swing();
  const tg = game.target; // step in toward the target node
  if (tg && !tg.dead && tg.dist > tg.def.radius + 1.6 && tg.dist < 7) {
    player.vel.x += (tg.pos.x - player.pos.x) / tg.dist * 7; player.vel.z += (tg.pos.z - player.pos.z) / tg.dist * 7;
  }
}
function attack() { if (swing.active) { if (swing.t / swing.dur > 0.45) swing.queued = true; } else startSwing(); }
function swordHit() {
  camera.getWorldDirection(v1);
  const fx = v1.x, fz = v1.z, fl = Math.hypot(fx, fz) || 1;
  let any = false;
  for (const m of monsters.list) {
    if (m.dead) continue;
    const dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    const reach = 3.9 + m.def.radius; // a spear reaches further than a sword, in a narrower line
    if (d > reach || Math.abs(m.center.y - (player.pos.y + 1.2)) > 3.2) continue;
    const dotp = (dx * fx + dz * fz) / ((d || 1) * fl);
    if (dotp < 0.6 && d > m.def.radius + 0.9) continue;
    hitMonster(m, swing.type === 2 ? 38 : 23, swing.type === 2 ? 2.4 : 1.2);
    v2.copy(m.center).lerp(camera.position, 0.25);
    burst(v2, 0xffc27a, 14, 6, 0.35, 8); burst(v2, 0xff3a22, 10, 4, 0.5, 10);
    any = true;
  }
  if (any) {
    sfx.hit(); game.hitstop = swing.type === 2 ? 0.09 : 0.055; game.shake = Math.max(game.shake, swing.type === 2 ? 0.4 : 0.22);
    player.mana = Math.min(100, player.mana + 4);
  }
}

function cast() {
  if (castCd > 0 || game.state !== 'playing') return;
  if (player.cls !== 'mage') return; // only the mage casts
  if (!player.battle) { setStance(true); return; }
  const s = SPELLS[spell];
  if (player.mana < s.cost) { sfx.deny(); msg('Not enough mana'); castCd = 0.3; return; }
  player.mana -= s.cost; castCd = 0.55; orbKick = 1; player.atkSeq = (player.atkSeq || 0) + 1;
  if (player.cls !== 'mage') { classSkill(); return; }
  if (spell === 0) {
    camera.getWorldDirection(v1);
    v2.copy(camera.position).addScaledVector(v1, 0.9);
    v3.set(-0.3, -0.18, 0).applyQuaternion(camera.quaternion); v2.add(v3);
    gem.getWorldPosition(v2); aimDir(v2, v1); // spells leave from the staff's crystal
    spawnBolt(v2, v1, 42, 36, 'player'); coop.shot('fire', v2, v3.copy(v1).multiplyScalar(42));
    flash(v2, 0xff8a33, 40, 0.2); sfx.fire();
  } else if (spell === 1) {
    const R = 10;
    for (const m of monsters.list) {
      if (m.dead || m.dist > R + m.def.radius) continue;
      hitMonster(m, 14, 0.5, { slow: 5.5 });
      burst(m.center, 0x8fe6ff, 12, 3, 0.8, 1);
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * 6.283;
      v2.set(player.pos.x + Math.sin(a) * 2, player.pos.y + 0.5, player.pos.z + Math.cos(a) * 2);
      burst(v2, 0x8fe6ff, 2, 9, 0.7, 0);
    }
    showRing(player.pos.x, player.pos.y, player.pos.z, R, 0x66d8ff);
    addMark('ice', player.pos.x, player.pos.z, R, 7); raiseShards(player.pos.x, player.pos.z, R, 6); // the ground stays frozen and keeps slowing
    zones.push({ kind: 'ice', x: player.pos.x, z: player.pos.z, r: R, t: 6, tick: 0.5 });
    flash(camera.position, 0x66d8ff, 90, 0.5); sfx.frost();
  } else {
    player.hp = Math.min(player.maxHp, player.hp + 40);
    camera.getWorldDirection(v1); v2.copy(camera.position).addScaledVector(v1, 2.6);
    burst(v2, 0x5cff8f, 16, 1.2, 1, -2, 2.2);
    game.healFx = 1; sfx.heal();
  }
}
// ---------- stances ----------
/** Battle stance readies the weapon and shows the target node; normal stance puts everything away. */
function setStance(battle) {
  const p = player;
  if (p.battle === battle || game.state !== 'playing') return;
  p.battle = battle; p.drawing = false; p.drawT = 0;
  if (battle) sfx.ready(); else { sfx.dodge(); swing.active = false; swing.queued = false; }
}
/**
 * Where a shot should go: always exactly where the crosshair points. Shots leave from the weapon, which sits
 * off to one side, so they are angled to meet the crosshair's line a little way out instead of flying parallel to it.
 */
function lookDir(out) { // straight from the player's view angles, so it is exact on the frame you fire
  const cp = Math.cos(player.pitch);
  return out.set(-Math.sin(player.yaw) * cp, Math.sin(player.pitch), -Math.cos(player.yaw) * cp);
}
function aimDir(origin, out) {
  lookDir(out);
  v3.set(player.pos.x, player.pos.y + EYE, player.pos.z).addScaledVector(out, 60);
  return out.copy(v3).sub(origin).normalize();
}
const arrowM = new THREE.MeshStandardMaterial({ color: 0xd9c79a, roughness: 0.8, emissive: 0x4a4030 });
function shootArrow(power, o) {
  const dir = new THREE.Vector3();
  lookDir(v1);
  v2.set(player.pos.x, player.pos.y + EYE - 0.12, player.pos.z).addScaledVector(v1, 0.9);
  const speed = o.speed || 45 + 35 * power;
  aimDir(v2, dir); // the arrow leaves along the aim, then gravity gives it its arc
  if (o.yaw) dir.applyAxisAngle(v3.set(0, 1, 0), o.yaw);
  const mesh = new THREE.Group();
  vp(mesh, HC, arrowM, null, AX, [0.012, 0.9, 0.012]);
  vp(mesh, CN, steelM, [0, 0, 0.5], [Math.PI / 2, 0, 0], [0.035, 0.12, 0.035]);
  mesh.position.copy(v2); scene.add(mesh);
  bolts.push({ mesh, vel: dir.multiplyScalar(speed), life: 3, dmg: o.dmg || 12 + 30 * power, owner: 'player', kind: 'arrow', grav: 5, pierce: !!o.pierce });
  player.reloadT = RELOAD; player.looseK = 1; sfx.bow();
  player.atkSeq = (player.atkSeq || 0) + 1; coop.shot('arrow', v2, bolts[bolts.length - 1].vel);
}
function staffShot() {
  if (staffCd > 0) return;
  staffCd = 0.36; staffKick = 1;
  gem.getWorldPosition(v2);
  const dir = aimDir(v2, new THREE.Vector3());
  const mesh = new THREE.Mesh(boltGeo, boltMat(0x9a7aff)); mesh.scale.setScalar(0.6);
  mesh.position.copy(v2); scene.add(mesh);
  bolts.push({ mesh, vel: dir.multiplyScalar(55), life: 2, dmg: 15, owner: 'player', kind: 'arcane', homing: !!game.lock, target: game.lock }); // only curves toward a locked target
  flash(v2, 0x9a7aff, 14, 0.15); sfx.zap();
  player.atkSeq = (player.atkSeq || 0) + 1; coop.shot('arcane', v2, bolts[bolts.length - 1].vel);
}
/** Runs every frame: held attacks (combo chain, staff autofire, bow draw) and the shield block. */
function heldAttack(dt) {
  const p = player, held = input.atk || touch.atk;
  p.reloadT -= dt; staffCd -= dt;
  p.blocking = p.cls === 'warrior' && p.battle && (input.alt || touch.block) && !swing.active;
  p.blockK += ((p.blocking ? 1 : 0) - p.blockK) * Math.min(1, dt * 14);
  if (!p.battle) { p.drawing = false; return; }
  if (p.cls === 'warrior') { if (held && !p.blocking && (!swing.active || swing.t / swing.dur > 0.45) && p.stamina >= 6) attack(); }
  else if (p.cls === 'mage') { if (held && p.stanceK > 0.8) staffShot(); }
  else if (p.drawing) {
    if (held || p.autoLoose) p.drawT = Math.min(1.2, p.drawT + dt);
    if (p.autoLoose && p.drawT >= MIN_DRAW) loose(); // a quick tap still plays the whole draw
  } else if (held && p.reloadT <= 0 && p.stamina >= 6 && p.stanceK > 0.8) { p.drawing = true; p.autoLoose = false; p.drawT = 0; sfx.draw(); }
}
const MIN_DRAW = 0.34, RELOAD = 0.55;
function loose() {
  const p = player;
  const power = Math.max(0.3, Math.min(1, p.drawT / 0.75));
  p.drawing = false; p.autoLoose = false; p.drawT = 0; p.looseK = 1;
  p.stamina = Math.max(0, p.stamina - 6); p.staminaDelay = 0.5;
  shootArrow(power, {});
}
function atkPress() {
  if (game.state !== 'playing') return;
  if (player.eatT > 0) return; // hands are full
  if (!player.battle) { setStance(true); return; }
  if (!game.lock && !game.lockOff && game.target) game.lock = game.target; // start fighting what you are facing
  if (player.cls === 'warrior' && !player.blocking) attack();
}
function atkRelease() {
  const p = player;
  if (p.cls !== 'archer' || !p.drawing) return;
  if (p.drawT < MIN_DRAW) p.autoLoose = true; else loose();
}
function healSelf(n) {
  player.hp = Math.min(player.maxHp, player.hp + n);
  camera.getWorldDirection(v1); v2.copy(camera.position).addScaledVector(v1, 2.6);
  burst(v2, 0x5cff8f, 16, 1.2, 1, -2, 2.2);
  addMark('heal', player.pos.x, player.pos.z, 2.4, 2.2);
  game.healFx = 1; sfx.heal();
}
/** Warrior and archer skills (the mage's spells live in cast()). */
function classSkill() {
  const P = player.pos;
  if (spell === 2) { healSelf(player.cls === 'warrior' ? 35 : 30); return; }
  if (player.cls === 'warrior') {
    if (spell === 0) { // Whirlwind: everything around you
      swing.active = true; swing.t = 0; swing.type = 0; swing.dur = 0.4; swing.hitDone = true; swing.queued = false;
      for (const m of monsters.list) {
        if (m.dead || m.dist > 4.6 + m.def.radius) continue;
        hitMonster(m, 30, 2); burst(m.center, 0xffc27a, 12, 6, 0.4, 8);
      }
      showRing(P.x, P.y + 0.8, P.z, 4.6, 0xffc060); sfx.swing(); sfx.hit(); game.shake = Math.max(game.shake, 0.35);
    } else { // Shield Bash: knocks back, slows and interrupts whatever is in front
      shieldKick = 1; camera.getWorldDirection(v1);
      for (const m of monsters.list) {
        if (m.dead || m.dist > 4.2 + m.def.radius) continue;
        const dx = m.pos.x - P.x, dz = m.pos.z - P.z;
        if ((dx * v1.x + dz * v1.z) / (m.dist || 1) < 0.3) continue;
        hitMonster(m, 18, 3.5, { slow: 3, stun: true });
        burst(m.center, 0xffe9a8, 14, 6, 0.4, 6);
      }
      sfx.block(); sfx.hit(); game.shake = Math.max(game.shake, 0.3);
    }
  } else if (spell === 0) shootArrow(1, { dmg: 70, speed: 95, pierce: true }); // Power Shot: goes through everything
  else for (let i = -2; i <= 2; i++) shootArrow(0.7, { dmg: 20, yaw: i * 0.09 }); // Volley
}

// ---------- target node ----------
const nodeCv = document.createElement('canvas'); nodeCv.width = nodeCv.height = 128;
{
  const c = nodeCv.getContext('2d'); c.translate(64, 64); c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineCap = 'round';
  c.lineWidth = 3; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(0, 0, 50, i * 1.5708 + 0.3, i * 1.5708 + 1.27); c.stroke(); }
  c.lineWidth = 4; for (let i = 0; i < 4; i++) { c.rotate(1.5708); c.beginPath(); c.moveTo(0, -61); c.lineTo(0, -44); c.stroke(); }
  c.beginPath(); c.moveTo(0, -6); c.lineTo(6, 0); c.lineTo(0, 6); c.lineTo(-6, 0); c.closePath(); c.fill();
}
const node = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nodeCv), depthTest: false, depthWrite: false, fog: false, transparent: true }));
node.renderOrder = 20; node.visible = false; scene.add(node);
/** In battle stance, mark the creature nearest the crosshair that this class can reach. */
/** Next creature in reach after the current target (Tab / tap the target panel). */
function cycleTarget() {
  if (!player.battle) return;
  const range = CLASSES[player.cls].range;
  const list = monsters.list.filter((m) => !m.dead && m.dist < range).sort((a, b) => a.dist - b.dist);
  if (!list.length) return;
  game.lock = list[(list.indexOf(game.lock || game.target) + 1) % list.length];
}
function updateTarget(dt) {
  let best = null, bs = -1;
  const lk = game.lock;
  if (lk && (lk.dead || !player.battle || game.lockOff || lk.dist > CLASSES[player.cls].range * 1.3 + 8)) game.lock = null;
  if (game.lock) best = game.lock; // the creature you are fighting stays the target
  else if (player.battle && game.state === 'playing') {
    camera.getWorldDirection(v1);
    const range = CLASSES[player.cls].range;
    for (const m of monsters.list) {
      if (m.dead) continue;
      v2.copy(m.center).sub(camera.position);
      const d = v2.length(), dot = v2.dot(v1) / (d || 1);
      if (d > range || (dot < 0.86 && d > 6) || dot < 0.3) continue;
      const score = dot - d * 0.0015 + (m === game.target ? 0.02 : 0);
      if (score > bs) { bs = score; best = m; }
    }
  }
  game.target = best;
  const panel = $('target');
  if (!best) { node.visible = false; panel.style.display = 'none'; return; }
  node.visible = true; node.position.copy(best.center);
  node.scale.setScalar(Math.min(best.def.radius * 2.1 + 0.7, 0.4 + camera.position.distanceTo(best.center) * 0.3) * (1 + Math.sin(game.time * 6) * 0.05));
  node.material.rotation += dt * 1.3; node.material.color.set(CLASSES[player.cls].node).multiplyScalar(1.25);
  panel.style.display = 'block';
  setText('tname', `${game.lock === best ? '◆ ' : ''}${best.def.name} · ${best.def.temper === 'aggressive' ? 'hostile' : best.def.temper}`);
  panel.classList.toggle('locked', game.lock === best);
  $('thp').style.width = Math.max(0, best.hp / best.maxHp * 100) + '%';
}

// ---------- saving (this device only) ----------
const SAVE_KEY = 'ezhunter-save-v1';
function readSave() {
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); return d && d.v === 1 && CLASSES[d.cls] && MAPS[d.map] ? d : null; } catch { return null; }
}
function saveGame(silent) {
  if (game.state !== 'playing' || game.travelling) return false;
  const p = player;
  const d = { v: 1, cls: p.cls, map: game.mapId, x: p.pos.x, z: p.pos.z, yaw: p.yaw, hp: p.hp, maxHp: p.maxHp, stamina: p.stamina, mana: p.mana, hunger: p.hunger,
    meat: p.meat, essence: p.essence, level: p.level, kills: p.kills, dmgMul: p.dmgMul, time: game.time, spell, saved: Date.now() };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); if (!silent) msg('Progress saved'); return true; }
  catch { if (!silent) msg('Could not save on this device'); return false; }
}
addEventListener('pagehide', () => saveGame(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(true); });
/** Pick the class (and restore a save, if given) before the hunt starts. */
function applyStart(cls, sv) {
  const p = player;
  p.cls = cls; SPELLS = CLASSES[cls].skills;
  document.body.dataset.cls = cls;
  for (let k = 0; k < 3; k++) if (SPELLS[k]) $('s' + k).innerHTML = `<b>${k + 1}</b>${SPELLS[k].name}<br><i>${SPELLS[k].cost} mana</i>`;
  p.maxHp = p.hp = CLASSES[cls].hp;
  if (sv) {
    if (sv.map !== game.mapId) { world.load(sv.map); game.mapId = sv.map; }
    for (const key of ['hp', 'maxHp', 'stamina', 'mana', 'hunger', 'meat', 'essence', 'level', 'kills', 'dmgMul', 'yaw']) if (typeof sv[key] === 'number') p[key] = sv[key];
    p.pos.set(sv.x, heightAt(sv.x, sv.z), sv.z);
    game.time = sv.time || 0; game.day = Math.floor(game.time / DAY_LEN + 0.07) + 1;
  }
  selectSpell(sv ? sv.spell || 0 : 0);
}

function selectSpell(i) {
  spell = (i + 3) % 3;
  if (SPELLS[spell]) orbMat.emissive.set(SPELLS[spell].color);
  for (let k = 0; k < 3; k++) $('s' + k).classList.toggle('on', k === spell);
}
function eat() {
  if (player.meat <= 0) { msg('No meat — go hunt'); sfx.deny(); return; }
  if (player.hunger > 92 && player.hp >= player.maxHp) { msg('You are not hungry'); return; }
  if (player.eatT > 0) return;
  player.eatT = 0.0001; player.eatBit = false; // the bite lands partway through the animation
}
const needEssence = () => Math.round(40 * Math.pow(player.level, 1.35));
function gainEssence(v) {
  player.essence += v; player.mana = Math.min(100, player.mana + v * 0.8);
  while (player.essence >= needEssence()) {
    player.essence -= needEssence(); player.level++;
    player.maxHp += 10; player.hp = Math.min(player.maxHp, player.hp + 30); player.dmgMul += 0.12;
    msg(`Hunter rank ${player.level} — you strike harder`); sfx.level(); game.healFx = 0.7;
  }
}

// ---------------------------------------------------------------- monsters
const monsters = new MonsterManager(scene, game);
game.monsters = monsters;
function seedWorld() {
  monsters.spawnNear('grazer', 22, 34, 2); monsters.spawnNear('grazer', 35, 60, 2);
  monsters.spawnNear('hare', 18, 40, 1); monsters.spawnNear('hare', 30, 60, 2);
  monsters.spawnNear('stonehorn', 40, 70, 1);
  monsters.spawnNear('duskfang', 70, 95, 2);
}

// ---------------------------------------------------------------- input
const keys = {};
const input = { atk: false, alt: false };
addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') { if (e.code === 'Escape') toggleCoop(false); return; }
  if (e.repeat) return;
  keys[e.code] = true;
  if (game.state !== 'playing' || game.paused) return;
  if (e.code === 'Digit1') selectSpell(0);
  else if (e.code === 'Digit2') selectSpell(1);
  else if (e.code === 'Digit3') selectSpell(2);
  else if (e.code === 'KeyF') eat();
  else if (e.code === 'KeyQ') dodge();
  else if (e.code === 'KeyR') setStance(!player.battle);
  else if (e.code === 'Tab') cycleTarget();
  else if (e.code === 'KeyT') {
    if (game.lock) game.lock = null; // let go of the current target; attacking locks on again
    else { game.lockOff = !game.lockOff; msg(game.lockOff ? 'Lock-on camera off' : 'Lock-on camera on'); }
  }
  else if (e.code === 'KeyE') cast();
  else if (e.code === 'KeyP') saveGame();
  else if (e.code === 'KeyO') toggleCoop();
  else if (e.code === 'KeyM') toggleMusic();
  else if (e.code === 'KeyB') toggleBag();
  else if (e.code === 'KeyL') toggleTorch();
  else if (e.code === 'KeyH') goHome();
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; input.atk = input.alt = false; });
// ---------- bag ----------
function toggleBag(open = $('bagPanel').style.display !== 'flex') {
  if (game.state !== 'playing' && open) return;
  if (open && game.panel) toggleCoop(false);
  game.panel = open;
  $('bagPanel').style.display = open ? 'flex' : 'none';
  if (open) { $('bagCls').textContent = CLASSES[player.cls].name; $('bagHome').style.display = world.map.safe ? 'none' : 'block'; if (document.pointerLockElement) document.exitPointerLock(); if (!coop.role) game.paused = true; }
  else { game.paused = false; $('pause').style.display = 'none'; if (!touch.on && game.state === 'playing') lock(); }
}
$('bagPill').addEventListener('click', () => toggleBag());
$('torchPill').addEventListener('click', toggleTorch);
$('bagClose').addEventListener('click', () => toggleBag(false));
$('bagEat').addEventListener('click', () => { toggleBag(false); eat(); });
$('bagSave').addEventListener('click', () => { toggleBag(false); saveGame(); });
$('bagHome').addEventListener('click', () => { toggleBag(false); goHome(); });
// ---------- co-op panel ----------
function toggleCoop(open = !game.panel) {
  if (game.state !== 'playing' && open) return;
  if (open) $('bagPanel').style.display = 'none';
  game.panel = open;
  $('coopPanel').style.display = open ? 'flex' : 'none';
  if (open) { coop.render(); $('coopName').value = coop.name; if (document.pointerLockElement) document.exitPointerLock(); if (!coop.role) game.paused = true; }
  else { game.paused = false; $('pause').style.display = 'none'; if (!touch.on && game.state === 'playing') lock(); }
}
$('coopPill').addEventListener('click', () => toggleCoop());
$('musicPill').addEventListener('click', toggleMusic);
$('musicPill').classList.toggle('off', music.muted);
$('coopClose').addEventListener('click', () => toggleCoop(false));
$('coopHost').addEventListener('click', () => { coop.setName($('coopName').value); game.paused = false; coop.host(); });
$('coopJoin').addEventListener('click', () => { coop.setName($('coopName').value); game.paused = false; coop.join($('coopCode').value); });
$('coopLeave').addEventListener('click', () => { coop.leave(); if (game.panel) game.paused = true; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement || game.paused) return;
  if (game.lock) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * 0.0022));
});
addEventListener('mousedown', (e) => {
  if (game.state !== 'playing' || game.paused || document.pointerLockElement !== renderer.domElement) return;
  if (e.button === 0) { input.atk = true; atkPress(); }
  else if (e.button === 2) { input.alt = true; if (player.cls === 'mage') cast(); else if (player.cls === 'warrior' && !player.battle) setStance(true); }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) { input.atk = false; atkRelease(); } else if (e.button === 2) input.alt = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (game.state === 'playing' && !game.paused) selectSpell(spell + (e.deltaY > 0 ? 1 : -1)); });

let hadLock = false;
function lock() { try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignored */ } }
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked) { hadLock = true; game.paused = false; $('pause').style.display = 'none'; }
  else if (hadLock && game.state === 'playing' && !game.panel) {
    if (coop.role) return; // a shared hunt cannot pause: just click the view to look around again
    game.paused = true; $('pause').style.display = 'flex';
  }
});
function begin(cls, sv) {
  if (game.state !== 'menu') return;
  wakeAudio(); applyStart(cls, sv);
  $('start').style.display = 'none'; $('hud').style.display = 'block';
  game.state = 'playing'; monsters.seed();
  if (touch.on) {
    try { const f = document.documentElement.requestFullscreen?.(); if (f && f.catch) f.catch(() => {}); } catch { /* ignored */ }
    try { const o = screen.orientation?.lock?.('landscape'); if (o && o.catch) o.catch(() => {}); } catch { /* ignored */ }
  } else lock();
  syncHomeAvatar();
  msg(sv ? `Welcome back, ${CLASSES[cls].name}` : `${CLASSES[cls].name} — this is your cabin. Step through a waygate to hunt.`);
}
document.querySelectorAll('#classes .card').forEach((c) => c.addEventListener('click', () => begin(c.dataset.cls)));
{
  const sv = readSave();
  if (sv) {
    const b = $('continue');
    b.style.display = 'block';
    b.textContent = `Continue — ${CLASSES[sv.cls].name}, rank ${sv.level}, ${MAPS[sv.map].name}`;
    b.addEventListener('click', () => begin(sv.cls, sv));
  }
}
$('pause').addEventListener('click', lock);
$('deadNew').addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } location.reload(); });
$('deadHome').addEventListener('click', () => {
  const p = player;
  p.hp = p.maxHp; p.hunger = Math.max(p.hunger, 60); p.stamina = 100; p.mana = 100; p.burnT = p.chillT = 0; p.eatT = 0; p.battle = false; p.torch = false; p.vel.set(0, 0, 0);
  game.state = 'playing'; game.lock = null; game.battleT = 0; game.paused = false;
  $('dead').style.display = 'none'; $('hud').style.display = 'block';
  arrive('home'); // rank, meat and kills are kept
  if (!touch.on) lock();
  msg('You wake at your cabin, patched up');
});
renderer.domElement.addEventListener('click', () => { if (game.state === 'playing' && !document.pointerLockElement && !touch.on) lock(); });

// ---------------------------------------------------------------- touchscreen
// Switched on by the first real touch, so mouse + keyboard players never see it.
const touch = { on: false, joyId: null, ox: 0, oy: 0, jx: 0, jy: 0, sprint: false, lookId: null, lx: 0, ly: 0, atk: false, jump: false, block: false };
game.touch = touch;
const stick = $('stick'), knob = $('knob');
const STICK_R = 60;
addEventListener('touchstart', () => { if (!touch.on) { touch.on = true; document.body.classList.add('touch'); } }, { capture: true, passive: true });
function endJoy() { touch.joyId = null; touch.jx = touch.jy = 0; touch.sprint = false; stick.style.display = 'none'; }
$('touch').addEventListener('touchstart', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.45 && touch.joyId === null) {
      touch.joyId = t.identifier; touch.ox = t.clientX; touch.oy = t.clientY;
      stick.style.left = t.clientX + 'px'; stick.style.top = t.clientY + 'px'; stick.style.display = 'block';
      knob.style.transform = '';
    } else if (touch.lookId === null) { touch.lookId = t.identifier; touch.lx = t.clientX; touch.ly = t.clientY; }
  }
}, { passive: false });
addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.joyId) {
      let dx = (t.clientX - touch.ox) / STICK_R, dy = (t.clientY - touch.oy) / STICK_R;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      touch.jx = Math.abs(dx) < 0.12 ? 0 : dx; touch.jy = Math.abs(dy) < 0.12 ? 0 : dy;
      touch.sprint = l > 0.95 && dy < -0.6;
      knob.style.transform = `translate(${dx * STICK_R}px, ${dy * STICK_R}px)`;
    } else if (t.identifier === touch.lookId) {
      if (game.state === 'playing' && !game.lock) {
        player.yaw -= (t.clientX - touch.lx) * 0.0055;
        player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - (t.clientY - touch.ly) * 0.0055));
      }
      touch.lx = t.clientX; touch.ly = t.clientY;
    }
  }
}, { passive: true });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.joyId) endJoy();
    else if (t.identifier === touch.lookId) touch.lookId = null;
  }
}
addEventListener('touchend', touchEnd); addEventListener('touchcancel', touchEnd);
function bindBtn(el, down, up) {
  el.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    el.classList.add('down');
    if (game.state === 'playing') down();
  }, { passive: false });
  const end = (e) => { e.stopPropagation(); el.classList.remove('down'); if (up) up(); };
  el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
}
bindBtn($('bAtk'), () => { touch.atk = true; atkPress(); }, () => { touch.atk = false; atkRelease(); });
bindBtn($('bCast'), () => cast());
bindBtn($('bJump'), () => { touch.jump = true; }, () => { touch.jump = false; });
bindBtn($('bDodge'), () => dodge());
bindBtn($('bEat'), () => eat());
bindBtn($('bStance'), () => setStance(!player.battle));
bindBtn($('bBlock'), () => { if (!player.battle) setStance(true); touch.block = true; }, () => { touch.block = false; });
bindBtn($('target'), () => cycleTarget());
[0, 1, 2].forEach((k) => bindBtn($('s' + k), () => selectSpell(k)));

function dodge() {
  if (player.dodgeCd > 0 || player.stamina < 22 || !player.onGround) return;
  const [mx, mz] = moveDir();
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  player.dodgeX = mx || mz ? mx : s; player.dodgeZ = mx || mz ? mz : c; // default: backstep
  player.dodgeT = 0.32; player.dodgeCd = 0.7; player.stamina -= 22; player.staminaDelay = 0.8;
  sfx.dodge();
}
function moveDir() {
  let fx = 0, fz = 0;
  if (keys.KeyW) fz -= 1; if (keys.KeyS) fz += 1; if (keys.KeyA) fx -= 1; if (keys.KeyD) fx += 1;
  fx += touch.jx; fz += touch.jy; // analog stick: partial push = walk slower
  if (!fx && !fz) return [0, 0];
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw), l = Math.max(1, Math.hypot(fx, fz));
  return [(c * fx + s * fz) / l, (-s * fx + c * fz) / l];
}

// ---------------------------------------------------------------- HUD
function msg(text) {
  const d = document.createElement('div'); d.textContent = text;
  const log = $('log'); log.appendChild(d);
  while (log.children.length > 4) log.firstChild.remove();
  setTimeout(() => d.remove(), 3200);
}
/** Damage number that pops at a world position and drifts up. */
function floatText(text, pos, lift = 1, big = false) {
  v3.set(pos.x, pos.y + lift * 0.5, pos.z).project(camera);
  if (v3.z > 1) return;
  const d = document.createElement('div');
  d.className = big ? 'dmg big' : 'dmg'; d.textContent = text;
  d.style.left = ((v3.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 40) + 'px';
  d.style.top = ((-v3.y * 0.5 + 0.5) * innerHeight) + 'px';
  $('dmgs').appendChild(d);
  setTimeout(() => d.remove(), 800);
}

// ---------- mini-map: rotates with you, shows terrain, gates, camp and nearby beasts ----------
const mmc = $('minimap').getContext('2d');
const TEMPER_COL = { aggressive: '#ff4a30', neutral: '#ffc040', passive: '#8fe070' };
let mmSkip = 0;
function drawMinimap() {
  if (mmSkip++ % 2) return;
  const c = mmc, S = 176, h = S / 2, range = 150, k = (h - 4) / range, P = player.pos, yaw = player.yaw;
  c.clearRect(0, 0, S, S);
  c.save();
  c.beginPath(); c.arc(h, h, h - 4, 0, 6.3); c.clip();
  c.fillStyle = '#07090c'; c.fillRect(0, 0, S, S);
  c.translate(h, h); c.rotate(yaw); c.scale(k, k); c.translate(-P.x, -P.z);
  c.drawImage(world.minimap, -450, -450, 900, 900);
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2 / k; c.beginPath(); c.arc(0, 0, WORLD_R, 0, 6.3); c.stroke();
  c.restore();
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const proj = (x, z, edge) => {
    let sx = ((x - P.x) * cs - (z - P.z) * sn) * k, sy = ((x - P.x) * sn + (z - P.z) * cs) * k;
    const l = Math.hypot(sx, sy), lim = h - 11;
    if (l > lim) { if (!edge) return null; sx *= lim / l; sy *= lim / l; }
    return [h + sx, h + sy, l > lim];
  };
  for (const m of monsters.list) {
    if (m.dead) continue;
    const q = proj(m.pos.x, m.pos.z, false);
    if (!q) continue;
    c.fillStyle = TEMPER_COL[m.def.temper];
    c.beginPath(); c.arc(q[0], q[1], Math.min(4.5, 1.6 + m.def.radius), 0, 6.3); c.fill();
  }
  for (const R of coop.remotes()) { // fellow hunters
    if (R.map !== game.mapId) continue;
    const q = proj(R.pos.x, R.pos.z, true);
    c.fillStyle = '#4aa3ff'; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(q[0], q[1], 4.5, 0, 6.3); c.fill(); c.stroke();
  }
  for (const l of loot) { const q = proj(l.mesh.position.x, l.mesh.position.z, false); if (q) { c.fillStyle = '#62e6ff'; c.fillRect(q[0] - 1, q[1] - 1, 2, 2); } }
  const diamond = (q, col, r) => {
    c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.globalAlpha = q[2] ? 0.75 : 1;
    c.beginPath(); c.moveTo(q[0], q[1] - r); c.lineTo(q[0] + r, q[1]); c.lineTo(q[0], q[1] + r); c.lineTo(q[0] - r, q[1]); c.closePath(); c.fill(); c.stroke();
    c.globalAlpha = 1;
  };
  for (const g of world.gates) diamond(proj(g.x, g.z, true), '#' + MAPS[g.to].gate.toString(16).padStart(6, '0'), 6.5);
  const camp = proj(0, 0, true);
  c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.arc(camp[0], camp[1], 3.5, 0, 6.3); c.fill(); c.stroke();
  c.fillStyle = '#e8c98a'; c.font = 'bold 12px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('N', h + sn * (h - 13), h - cs * (h - 13)); // north = -Z
  c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(h, h - 8); c.lineTo(h + 5.5, h + 6); c.lineTo(h, h + 3); c.lineTo(h - 5.5, h + 6); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(232,201,138,.7)'; c.lineWidth = 2.5; c.beginPath(); c.arc(h, h, h - 4, 0, 6.3); c.stroke();
}
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updateHud(dayT) {
  $('hp').style.width = Math.max(0, player.hp / player.maxHp * 100) + '%';
  $('st').style.width = player.stamina + '%';
  $('mp').style.width = player.mana + '%';
  $('hg').style.width = Math.max(0, player.hunger) + '%';
  $('hg').classList.toggle('low', player.hunger < 25);
  $('hp').classList.toggle('low', player.hp < player.maxHp * 0.3);
  setText('meat', player.meat); setText('kills', player.kills); setText('lvl', player.level); setText('torchPill', player.torch || player.torchFuel < TORCH_MAX - 1 ? `Torch ${Math.round(player.torchFuel / TORCH_MAX * 100)}%` : 'Torch'); $('torchPill').classList.toggle('on', player.torch); setText('meatHud', player.meat); setText('eatN', player.meat);
  $('xpf').style.width = (player.essence / needEssence() * 100) + '%';
  const part = dayT < 0.06 ? 'Dawn' : dayT < 0.42 ? 'Day' : dayT < 0.5 ? 'Dusk' : 'Night';
  setText('day', `${MAPS[game.mapId].name} · Day ${game.day} · ${part}`);
  $('hurt').style.opacity = Math.max(game.hurtFx, player.hunger <= 0 ? 0.35 : 0, player.hp < 30 ? 0.3 : 0);
  $('heal').style.opacity = game.healFx;
  setText('stance', player.battle ? `${CLASSES[player.cls].name} · battle stance` : 'Normal stance · R to ready');
  $('stance').classList.toggle('on', player.battle);
  $('chill').style.opacity = player.chillT > 0 ? Math.min(1, player.chillT) * 0.8 : 0;
  drawMinimap();
}
function die(cause) {
  if (game.state === 'dead') return;
  game.state = 'dead'; sfx.die(); coop.leave();
  $('cause').textContent = cause;
  const t = Math.floor(game.time);
  $('stats').innerHTML = `Survived to <b>Day ${game.day}</b> (${Math.floor(t / 60)}m ${t % 60}s)<br>Beasts slain: <b>${player.kills}</b><br>Hunter rank: <b>${player.level}</b>`;
  $('dead').style.display = 'flex'; $('hud').style.display = 'none';
  if (document.pointerLockElement) document.exitPointerLock();
}

// ---------------------------------------------------------------- update
function updatePlayer(dt) {
  const p = player;
  const [mx, mz] = moveDir();
  const moving = mx !== 0 || mz !== 0;
  const sprint = moving && p.stamina > 0 && p.dodgeT <= 0 && ((keys.ShiftLeft && keys.KeyW) || touch.sprint);
  heldAttack(dt);
  if (touch.on) stick.classList.toggle('sprint', sprint);
  let tx, tz;
  p.dodgeCd -= dt;
  if (p.dodgeT > 0) { p.dodgeT -= dt; tx = p.dodgeX * 19; tz = p.dodgeZ * 19; }
  else { const sp = (sprint ? 10.5 : 6) * (p.chillT > 0 ? 0.6 : 1) * CLASSES[p.cls].speed * (p.battle ? 1 : 1.1) * (p.blocking ? 0.45 : 1) * (p.drawing ? 0.6 : 1); tx = mx * sp; tz = mz * sp; }
  // terrain physics: uphill is slower, downhill a touch faster, too steep and you slide; water drags at your legs
  const gx = (heightAt(p.pos.x + 1, p.pos.z) - heightAt(p.pos.x - 1, p.pos.z)) / 2, gz = (heightAt(p.pos.x, p.pos.z + 1) - heightAt(p.pos.x, p.pos.z - 1)) / 2;
  const slope = Math.hypot(gx, gz), tl = Math.hypot(tx, tz);
  p.sliding = p.onGround && slope > 1.05 && p.dodgeT <= 0;
  if (tl > 0.01 && slope > 0.01 && p.dodgeT <= 0) {
    const up = (tx * gx + tz * gz) / tl; // > 0 means climbing
    const f = up > 0 ? 1 / (1 + up * 1.3) : 1 + Math.min(0.22, -up * 0.3);
    tx *= f; tz *= f;
    if (p.sliding && up > 0) { const d = (tx * gx + tz * gz) / (slope * slope); tx -= gx * d; tz -= gz * d; }
  }
  const liq = world.liquid, depth = liq.kind === 'water' ? liq.level - heightAt(p.pos.x, p.pos.z) : 0;
  p.inWater = depth > 0.05 && p.pos.y < liq.level + 0.2;
  if (p.inWater) { const w = 1 - Math.min(0.42, depth * 0.7); tx *= w; tz *= w; }
  const k = Math.min(1, dt * (p.sliding ? 2 : p.onGround ? 12 : 3));
  p.vel.x += (tx - p.vel.x) * k; p.vel.z += (tz - p.vel.z) * k;
  if (p.sliding) { const g = (slope - 0.95) * 22 + 5; p.vel.x -= gx / slope * g * dt; p.vel.z -= gz / slope * g * dt; }
  p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
  const r = Math.hypot(p.pos.x, p.pos.z);
  if (r > WORLD_R - 6) { p.pos.x *= (WORLD_R - 6) / r; p.pos.z *= (WORLD_R - 6) / r; }
  world.collide(p.pos, 0.45);
  for (const m of monsters.list) { // bodies are solid
    if (m.dead || m.def.hover) continue;
    const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, min = m.def.radius * 0.85 + 0.45, d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); p.pos.x += dx / d * (min - d); p.pos.z += dz / d * (min - d); }
  }
  const ground = heightAt(p.pos.x, p.pos.z);
  if (p.onGround && (keys.Space || touch.jump) && p.dodgeT <= 0) { p.vel.y = 7.6; p.onGround = false; }
  if (p.onGround) p.pos.y = ground;
  else {
    p.vel.y -= 24 * dt; p.pos.y += p.vel.y * dt;
    p.airT = (p.airT || 0) + dt;
    if (p.pos.y <= ground) {
      p.pos.y = ground; p.vel.y = 0; p.onGround = true; sfx.step();
      if (p.airT > 0.25) p.land = Math.min(1, p.airT * 1.6); // knees absorb the landing
      if (world.liquid.kind === 'water' && ground < world.liquid.level) { addRipple(p.pos.x, p.pos.z, 1.4); v2.set(p.pos.x, world.liquid.level, p.pos.z); burst(v2, 0xcfe8ff, 22, 4, 0.6, 12); }
      p.airT = 0;
    }
  }
  // vitals
  if (sprint) { p.stamina -= 15 * dt; p.staminaDelay = 0.7; }
  p.staminaDelay -= dt;
  if (p.staminaDelay <= 0) p.stamina += 24 * dt * (p.battle ? 1 : 1.4);
  p.stamina = Math.max(0, Math.min(100, p.stamina));
  p.mana = Math.min(100, p.mana + CLASSES[p.cls].manaRegen * dt);
  p.hunger = Math.max(0, p.hunger - (world.map.safe ? 0 : 0.42 + (sprint ? 0.3 : 0)) * (p.battle ? 1 : 0.85) * dt);
  if (world.map.safe && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 6 * dt); // rest at the cabin
  if (p.hunger <= 0) { p.hp -= 2.6 * dt; if (p.hp <= 0) die('Starved in the wilds'); }
  else if (p.hunger > 50 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1.3 * dt);
  if (p.torch) { p.torchFuel -= dt; if (p.torchFuel <= 0) { p.torchFuel = 0; p.torch = false; msg('Your torch has burnt out'); } }
  else p.torchFuel = Math.min(TORCH_MAX, p.torchFuel + dt * (world.map.safe ? 30 : 0.4));
  p.chillT -= dt;
  if (p.burnT > 0) {
    p.burnT -= dt; p.hp -= 3 * dt; game.hurtFx = Math.max(game.hurtFx, 0.35);
    if (p.hp <= 0) die('Burned to ash');
  }
  // footsteps + bob
  const hs = Math.hypot(p.vel.x, p.vel.z);
  if (p.onGround && hs > 1) {
    p.stepAcc += hs * dt; p.bob += hs * dt * 1.25;
    if (p.stepAcc > 3.2) { p.stepAcc = 0; sfx.step(); }
  }
  // swing
  swing.comboT -= dt; if (swing.comboT <= 0 && !swing.active) swing.combo = 0;
  if (swing.active) {
    swing.t += dt;
    if (!swing.hitDone && swing.t / swing.dur >= 0.42) { swing.hitDone = true; swordHit(); }
    if (swing.t >= swing.dur) { swing.active = false; if (swing.queued) startSwing(); }
  }
  castCd -= dt;
  // lock-on: keep the creature being fought in the centre of the view
  const lk = game.lock;
  if (lk && !lk.dead && p.battle) {
    const c = lk.center, ex = c.x - p.pos.x, ez = c.z - p.pos.z, ey = c.y - (p.pos.y + EYE);
    let dy = (Math.atan2(-ex, -ez) - p.yaw) % (Math.PI * 2);
    if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
    const kk = Math.min(1, dt * 9);
    p.yaw += dy * kk;
    const flat = Math.hypot(ex, ez) || 1, arc = p.cls === 'archer' ? flat * 0.00055 : 0; // archers hold a touch high for the arrow's drop
    p.pitch += (Math.max(-1.2, Math.min(1.2, Math.atan2(ey, flat) + arc)) - p.pitch) * kk;
  }
  // camera
  game.shake = Math.max(0, game.shake - dt * 1.6);
  const sh = game.shake * game.shake;
  p.land = Math.max(0, (p.land || 0) - dt * 3.5);
  camera.position.set(p.pos.x + (Math.random() - 0.5) * sh * 0.5, p.pos.y + EYE - Math.sin(p.land * Math.PI) * 0.16 + Math.sin(p.bob * 2) * 0.045 + (Math.random() - 0.5) * sh * 0.5, p.pos.z);
  camera.rotation.set(p.pitch + (Math.random() - 0.5) * sh * 0.06, p.yaw, (Math.random() - 0.5) * sh * 0.06 - (p.dodgeT > 0 ? 0.06 : 0));
  const fov = sprint ? 84 : 75;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 7); camera.updateProjectionMatrix(); }
  updateViewmodel(dt, hs);
}

function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i], bp = b.mesh.position;
    if (b.grav) b.vel.y -= b.grav * dt;
    if (b.homing && b.target && !b.target.dead) { // gentle curve toward the target node
      const sp = b.vel.length();
      v1.copy(b.target.center).sub(bp).normalize();
      b.vel.normalize().lerp(v1, Math.min(1, dt * 6)).normalize().multiplyScalar(sp);
    }
    bp.addScaledVector(b.vel, dt); b.life -= dt;
    if (b.kind === 'arrow') { v1.copy(bp).add(b.vel); b.mesh.lookAt(v1); }
    else burst(bp, b.owner === 'enemy' || b.owner === 'ghost' ? b.color : b.kind === 'arcane' ? 0x9a7aff : 0xff7a22, b.kind === 'arcane' ? 1 : 2, 0.8, 0.35, -1, 0.15);
    let done = b.life <= 0, direct = null;
    if (bp.y < heightAt(bp.x, bp.z) + 0.1) done = true;
    if (b.owner === 'ghost') {
      for (const m of monsters.list) if (!m.dead && m.center.distanceTo(bp) < m.def.radius + 0.55) { done = true; break; }
      if (done) { burst(bp, b.color, 14, 5, 0.4, 5); if (b.kind === 'fire') flash(bp, 0xff8a33, 60, 0.3); }
    } else if (b.owner === 'player') {
      for (const m of monsters.list) {
        if (!m.dead && !(b.hit && b.hit.has(m)) && m.center.distanceTo(bp) < m.def.radius + 0.55) { direct = m; break; }
      }
      if (!b.kind) { if (direct) done = true; if (done) explode(bp, b.dmg, direct); }
      else if (direct) {
        hitMonster(direct, b.dmg, b.kind === 'arrow' ? 1.2 : 0.6);
        burst(bp, b.kind === 'arrow' ? 0xffd9a0 : 0x9a7aff, 12, 5, 0.35, 6); sfx.hit();
        player.mana = Math.min(100, player.mana + 3);
        if (b.pierce) (b.hit || (b.hit = new Set())).add(direct); else done = true;
      } else if (done) burst(bp, 0x8a7a66, 6, 3, 0.3, 8);
    } else {
      v1.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
      if (v1.distanceTo(bp) < 0.95) { game.damagePlayer(b.dmg, bp, b.name, 4, b.effect); done = true; }
      if (done) { burst(bp, b.color, 18, 5, 0.5, 4); flash(bp, b.color, 40, 0.3); }
    }
    if (done) { scene.remove(b.mesh); bolts.splice(i, 1); }
  }
}
function updateLoot(dt) {
  for (let i = loot.length - 1; i >= 0; i--) {
    const l = loot[i], lp = l.mesh.position;
    l.t += dt; l.age += dt;
    l.mesh.rotation.y += dt * 2;
    v1.set(player.pos.x, player.pos.y + 1, player.pos.z);
    const d = v1.distanceTo(lp);
    if (d < 6 && l.age > 0.5) lp.addScaledVector(v1.sub(lp).normalize(), dt * (14 - d * 1.5));
    else lp.y = heightAt(lp.x, lp.z) + 0.6 + Math.sin(l.t * 3) * 0.12;
    if (d < 1.1) {
      if (l.kind === 'meat') player.meat += l.value; else gainEssence(l.value);
      sfx.pickup(); scene.remove(l.mesh); loot.splice(i, 1);
    } else if (l.age > 90) { scene.remove(l.mesh); loot.splice(i, 1); }
  }
}

let homeAv = null;
/** At the cabin your own character stands on the pedestal, so you can see what you look like. */
function syncHomeAvatar() {
  if (homeAv) { scene.remove(homeAv.g); homeAv.g.traverse((o) => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); homeAv = null; }
  if (!world.home || game.state !== 'playing') return;
  homeAv = buildChibi(player.cls, 0xe8c98a);
  homeAv.g.position.copy(world.home.pedestal); scene.add(homeAv.g);
  for (const a of homeAv.arms) a.g.rotation.z = a.s * 0.16;
}
function goHome() {
  if (world.map.safe) { msg('You are already home'); return; }
  if (game.battleT > 0) { msg("You can't slip away in the middle of a fight"); sfx.deny(); return; }
  travel('home');
}
function travel(id) {
  if (game.travelling) return;
  game.travelling = true; sfx.frost();
  $('fade').style.opacity = 1;
  setTimeout(() => { arrive(id); $('fade').style.opacity = 0; game.travelling = false; }, 550);
}
function arrive(id) {
  monsters.clear();
  for (const l of loot) scene.remove(l.mesh); loot.length = 0;
  for (const b of bolts) scene.remove(b.mesh); bolts.length = 0;
  world.load(id); game.mapId = id; game.gateHint = null;
  player.pos.set(0, heightAt(0, 0), 0); player.vel.set(0, 0, 0);
  monsters.seed();
  msg(`${MAPS[id].name} — ${MAPS[id].sub}`);
  syncHomeAvatar();
  setTimeout(() => saveGame(true), 700);
}
let ambAcc = 0;
/** Weather: snowfall on the tundra, rising embers in the wastes, fireflies in the vale at night. */
function ambient(dt) {
  if (world.home) { // hearth smoke and campfire sparks
    if (Math.random() < dt * 14) burst(world.home.chimney, 0x55504a, 1, 0.4, 2.6, -1.3, 0.3);
    if (Math.random() < dt * 22) burst(world.home.fireAt, Math.random() < 0.3 ? 0xffd27a : 0xff6a18, 1, 0.7, 0.9, -3.5, 0.35);
    if (homeAv) homeAv.g.rotation.y += dt * 0.6;
  }
  const kind = world.map.ambient, P = player.pos;
  ambAcc += dt * (kind === 'snow' ? 140 : kind === 'ember' ? 45 : game.isNight ? 22 : 0);
  while (ambAcc >= 1) {
    ambAcc -= 1;
    v2.set(P.x + (Math.random() - 0.5) * 50, P.y + (kind === 'snow' ? 4 + Math.random() * 10 : Math.random() * 5), P.z + (Math.random() - 0.5) * 50);
    if (kind === 'snow') burst(v2, 0x7f8894, 1, 0.6, 3.5, 1.4, 0);
    else if (kind === 'ember') burst(v2, 0xff5a18, 1, 0.7, 3, -1.6, 0);
    else burst(v2, 0xb8ff5a, 1, 0.5, 3, 0, 0);
  }
}
let nightAnnounced = false;
function update(dt) {
  game.time += dt;
  const cyc = game.time / DAY_LEN + 0.07;
  const dayT = cyc % 1, day = Math.floor(cyc) + 1;
  if (day !== game.day) { game.day = day; msg(`Day ${day} — the wilds grow fiercer`); }
  game.isNight = dayT >= 0.5;
  if (game.isNight && !nightAnnounced) { nightAnnounced = true; msg('Night falls. The predators grow bold.'); }
  if (!game.isNight) nightAnnounced = false;

  updatePlayer(dt);
  updateTarget(dt);
  coop.frame(dt);
  updateRipples(dt); updateTrajectory(); updateMarks(dt);
  // "in battle" drives the music: locked on to something, or a hostile creature is coming for you
  let fight = !!game.lock;
  if (!fight) for (const m of monsters.list) {
    if (!m.dead && m.dist < 38 && m.def.temper !== 'passive' && (m.state === 'chase' || m.state === 'windup' || m.state === 'strike')) { fight = true; break; }
  }
  game.battleT = fight ? 6 : Math.max(0, (game.battleT || 0) - dt); // stay in the battle theme a few seconds after it calms down
  game.saveT = (game.saveT || 0) + dt;
  if (game.saveT > 20) { game.saveT = 0; saveGame(true); }
  // waygates: walk into one to travel to another map
  for (const g of game.travelling ? [] : world.gates) {
    const gd = Math.hypot(player.pos.x - g.x, player.pos.z - g.z);
    if (gd < 2) { travel(g.to); break; }
    if (gd < 14 && game.gateHint !== g.to) { game.gateHint = g.to; msg(`Waygate to ${g.name} — walk through`); }
  }
  // lava burns
  if (world.liquid.kind === 'lava' && player.onGround && player.pos.y < world.liquid.level + 0.1) {
    player.hp -= 14 * dt; game.hurtFx = Math.max(game.hurtFx, 0.6);
    if (player.hp <= 0) die('Burned in the lava');
  }
  ambient(dt);
  monsters.update(dt);
  updateBolts(dt);
  updateLoot(dt);
  game.hurtFx = Math.max(0, game.hurtFx - dt * 1.8);
  game.healFx = Math.max(0, game.healFx - dt * 1.5);
  return dayT;
}
function updateFx(dt) {
  updateParticles(dt);
  for (const f of flashes) { if (f.t > 0) { f.t -= dt; f.l.intensity = f.peak * Math.max(0, f.t / f.max); } }
  if (ringT > 0) {
    ringT -= dt;
    const k = 1 - ringT / 0.5;
    ring.scale.setScalar(ringR * (0.15 + 0.85 * k)); ring.material.opacity = (1 - k) * 0.9;
    if (ringT <= 0) ring.visible = false;
  }
}

// ---------------------------------------------------------------- graphics quality
// Borrowed from Chibi World: measure the frame rate and step the expensive things down (or back up) to hold it.
const QL = [
  { pr: 1.5, bloom: true, sh: 2048, g: 1 },      // high
  { pr: 1.15, bloom: true, sh: 1024, g: 0.75 },
  { pr: 1, bloom: false, sh: 1024, g: 0.5 },     // mid: bloom is the single most expensive effect here
  { pr: 0.8, bloom: false, sh: 512, g: 0.3 },
  { pr: 0.65, bloom: false, sh: 0, g: 0.18 },    // low: no shadows
];
const QMODES = ['auto', 'high', 'mid', 'low'], QNAME = { auto: 'Auto', high: 'High', mid: 'Medium', low: 'Low' };
const Q = { mode: 'auto', lvl: -1, acc: 0, n: 0, cool: 3, fast: 0, min: 0, bloom: true, fps: 0 };
try { const m = localStorage.getItem('ezhunter-quality'); if (QMODES.includes(m)) Q.mode = m; } catch { /* storage unavailable */ }
function applyQ(l) {
  l = Math.max(0, Math.min(QL.length - 1, l));
  if (l === Q.lvl) return;
  Q.lvl = l;
  const q = QL[l], pr = Math.min(devicePixelRatio, q.pr);
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  Q.bloom = q.bloom; world.setShadow(q.sh); world.setGrass(q.g);
}
function setQMode(m) {
  Q.mode = m;
  try { localStorage.setItem('ezhunter-quality', m); } catch { /* */ }
  if (m === 'high') applyQ(0); else if (m === 'mid') applyQ(2); else if (m === 'low') applyQ(4);
  else { Q.min = 0; Q.cool = 3; applyQ(touch.on || matchMedia('(pointer: coarse)').matches ? 2 : 1); }
}
function qTick(raw) {
  if (document.hidden || raw > 0.25) { Q.acc = 0; Q.n = 0; return; } // a sleeping tab is not a slow device
  Q.acc += raw; Q.n++;
  if (Q.acc < 1.2) return;
  const fps = Q.n / Q.acc; Q.acc = 0; Q.n = 0; Q.fps = fps;
  $('qPill').textContent = `${QNAME[Q.mode]} · ${Math.round(fps)} fps`;
  if (Q.mode !== 'auto') return;
  Q.cool -= 1.2;
  if (Q.cool > 0) return;
  if (fps < 42 && Q.lvl < QL.length - 1) { if (Q.fast > 0 && Q.lvl >= Q.min) Q.min = Q.lvl + 1; applyQ(Q.lvl + 1); Q.cool = 2.4; Q.fast = 0; }
  else if (fps > 56) { Q.fast += 1.2; if (Q.fast > 14 && Q.lvl > Q.min) { applyQ(Q.lvl - 1); Q.cool = 4; Q.fast = 0.01; } }
  else Q.fast = 0;
}
$('qPill').addEventListener('click', () => setQMode(QMODES[(QMODES.indexOf(Q.mode) + 1) % QMODES.length]));

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let menuAngle = 0, lastDayT = 0.07;
function frame() {
  requestAnimationFrame(frame);
  // soundtrack: title air on the menu, each map's own theme, and the reel while fighting
  if (game.state !== 'playing') music.play('title', 2, 2.5);
  else if (game.battleT > 0) music.play('battle', 0.5, 0.9);
  else music.play(world.map.safe ? 'title' : game.mapId, 2.2, 2.6); // the cabin shares the gentle title air
  const rawDt = clock.getDelta();
  qTick(rawDt);
  let dt = Math.min(0.05, rawDt);
  if (game.state === 'menu') {
    menuAngle += dt * 0.05;
    camera.position.set(Math.sin(menuAngle) * 30, heightAt(0, 0) + 9, Math.cos(menuAngle) * 30);
    camera.lookAt(0, heightAt(0, 0) + 3, 0);
    vm.visible = false;
    world.update(0.07, player.pos, clock.elapsedTime);
  } else {
    vm.visible = game.state === 'playing';
    if (!game.paused && game.state === 'playing') {
      if (game.hitstop > 0) { game.hitstop -= dt; dt *= 0.08; }
      lastDayT = update(dt);
      updateHud(lastDayT);
    } else if (game.state === 'dead') {
      camera.position.y += (player.pos.y + 0.4 - camera.position.y) * Math.min(1, dt * 2);
      camera.rotation.z += (1.1 - camera.rotation.z) * Math.min(1, dt * 2);
      monsters.update(dt);
    }
    if (!game.paused) updateFx(dt);
    world.update(lastDayT, player.pos, clock.elapsedTime);
  }
  if (Q.bloom) composer.render(); else renderer.render(scene, camera);
  $('musicPill').classList.toggle('live', music.playing);
}
const coop = createCoop({ game, player, scene, monsters, MAPS, TYPES, CLASSES, heightAt, msg, localSlam, enemyShot, ghostShot });
game.coop = coop;
setQMode(Q.mode);
// On tablets and phones, act on the touch itself instead of waiting for the browser's follow-up click:
// that click never arrives if another finger is on the screen, which is what made these buttons feel dead.
for (const id of ['coopPill', 'musicPill', 'qPill', 'bagPill', 'torchPill', 'deadHome', 'deadNew', 'coopHost', 'coopJoin', 'coopLeave', 'coopClose', 'bagClose', 'bagEat', 'bagSave', 'bagHome']) {
  const el = $(id);
  el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); el.click(); }, { passive: false });
}
/** Draw each class once, holding its weapon, for the cards on the start page. */
function renderPortraits() {
  try {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setSize(240, 280); r.toneMapping = THREE.ACESFilmicToneMapping;
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 240 / 280, 0.1, 20);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x665544, 1.7));
    const dl = new THREE.DirectionalLight(0xfff0dd, 2.6); dl.position.set(2, 4, 5); sc.add(dl);
    cam.position.set(0.75, 1.0, 3.5); cam.lookAt(0.05, 0.86, 0);
    for (const cls of Object.keys(CLASSES)) {
      const av = buildChibi(cls, 0xe8c98a);
      av.g.rotation.y = 0.4; for (const a of av.arms) a.g.rotation.z = a.s * 0.2;
      sc.add(av.g); r.render(sc, cam);
      $('img-' + cls).src = r.domElement.toDataURL('image/png');
      sc.remove(av.g); av.g.traverse((o) => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } if (o.geometry) o.geometry.dispose(); });
    }
    r.dispose(); r.forceContextLoss();
  } catch { /* the cards still work without pictures */ }
}
renderPortraits();
game.debug = { goHome, toggleBag, eat, zones, coop, toggleCoop, music, Q, applyQ, setQMode, world, scene, renderer, camera, composer, attack, cast, selectSpell, eat, dodge, travel, begin, setStance, atkPress, atkRelease, saveGame, readSave, input, bolts, rig: { sword, staff, bowArm, shieldArm, nock },
  /** Advance the simulation by n fixed frames (for automated checks). */
  step: (n = 60) => { for (let i = 0; i < n; i++) { lastDayT = update(1 / 60); updateFx(1 / 60); } updateHud(lastDayT); } };
selectSpell(0);
frame();
