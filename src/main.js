import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld, heightAt, WORLD_R, MAPS } from './world.js';
import { MonsterManager } from './monsters.js';
import { Sfx } from './audio.js';

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
world.load('vale');
const sfx = new Sfx();

// ---------------------------------------------------------------- game state
const player = {
  pos: new THREE.Vector3(0, heightAt(0, 0), 0), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true,
  hp: 100, maxHp: 100, stamina: 100, mana: 100, hunger: 100,
  meat: 1, essence: 0, level: 1, kills: 0, dmgMul: 1,
  staminaDelay: 0, chillT: 0, burnT: 0, dodgeT: 0, dodgeCd: 0, dodgeX: 0, dodgeZ: 0, stepAcc: 0, bob: 0,
};
const game = {
  player, sfx, mapId: 'vale', state: 'menu', paused: false, time: 0, day: 1, isNight: false,
  hitstop: 0, shake: 0, hurtFx: 0, healFx: 0,
};
window.__game = game;

const SPELLS = [
  { name: 'Firebolt', cost: 18, color: 0xff7a22 },
  { name: 'Frost Nova', cost: 35, color: 0x66d8ff },
  { name: 'Mend', cost: 40, color: 0x5cff8f },
];
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
  add(new THREE.BoxGeometry(0.075, 1.05, 0.016), steel, 0.67);
  const tip = add(new THREE.ConeGeometry(0.053, 0.16, 4), steel, 1.27); tip.scale.z = 0.3; tip.rotation.y = Math.PI / 4;
  add(new THREE.BoxGeometry(0.014, 0.8, 0.02), rune, 0.62);
  add(new THREE.BoxGeometry(0.34, 0.05, 0.07), gold, 0.13);
  add(new THREE.CylinderGeometry(0.028, 0.032, 0.26, 8), leather, -0.02);
  add(new THREE.SphereGeometry(0.045, 8, 6), gold, -0.17);
}
// Hands: jointed fingers (three phalanges each) so the right can close into a fist on the grip
// and the left can hold the spell orb in an open, cupped palm.
const HC = new THREE.CylinderGeometry(1, 1, 1, 8), HS = new THREE.SphereGeometry(1, 10, 8);
const skinM = new THREE.MeshStandardMaterial({ color: 0xc8997a, roughness: 0.75 });
const clothM = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1 });
const bracerM = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.85 });
const bracerD = new THREE.MeshStandardMaterial({ color: 0x21140c, roughness: 0.85 });
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
  vp(h, HC, clothM, [0, -0.012, 0.46], AX, [0.058, 0.36, 0.062]);
  vp(h, HC, bracerM, [0, -0.005, 0.2], AX, [0.047, 0.24, 0.05]);
  vp(h, HC, bracerD, [0, -0.005, 0.31], AX, [0.052, 0.03, 0.055]);
  vp(h, HC, bracerD, [0, -0.005, 0.1], AX, [0.045, 0.025, 0.046]);
  for (let i = 0; i < 3; i++) vp(h, HS, studM, [0, 0.045, 0.14 + i * 0.06], null, 0.008);
  vp(h, HS, skinM, [0, 0, 0.045], null, [0.036, 0.026, 0.04]);            // wrist
  vp(h, HS, bracerM, [0, 0, -0.035], null, [0.05, 0.024, 0.058]);         // glove back
  vp(h, HS, skinM, [0, 0.004, -0.04], null, [0.046, 0.022, 0.054]);       // palm
  for (let i = 0; i < 4; i++) {
    const len = [0.036, 0.041, 0.039, 0.031][i];
    const k1 = new THREE.Group(); k1.position.set((i - 1.5) * 0.0235 * side, 0, -0.083 + Math.abs(i - 1.4) * 0.006);
    k1.rotation.y = (i - 1.5) * -0.07 * side; h.add(k1);
    vp(k1, HS, skinM, null, null, 0.0125); vp(k1, HC, skinM, [0, 0, -len / 2], AX, [0.0105, len, 0.0105]);
    const k2 = new THREE.Group(); k2.position.z = -len; k1.add(k2);
    vp(k2, HS, skinM, null, null, 0.011); vp(k2, HC, skinM, [0, 0, -len * 0.36], AX, [0.0095, len * 0.72, 0.0095]);
    const k3 = new THREE.Group(); k3.position.z = -len * 0.72; k2.add(k3);
    vp(k3, HS, skinM, null, null, 0.0098); vp(k3, HC, skinM, [0, 0, -len * 0.3], AX, [0.0085, len * 0.6, 0.0085]);
    vp(k3, HS, skinM, [0, 0, -len * 0.6], null, 0.0088);
    F.push([k1, k2, k3]);
  }
  const t1 = new THREE.Group(); t1.position.set(-side * 0.042, -0.004, -0.012); t1.rotation.set(0, side * 0.9, 0); h.add(t1);
  vp(t1, HS, skinM, null, null, [0.017, 0.015, 0.02]); vp(t1, HC, skinM, [0, 0, -0.02], AX, [0.0125, 0.04, 0.0125]);
  const t2 = new THREE.Group(); t2.position.z = -0.04; t1.add(t2);
  vp(t2, HS, skinM, null, null, 0.012); vp(t2, HC, skinM, [0, 0, -0.015], AX, [0.0105, 0.03, 0.0105]); vp(t2, HS, skinM, [0, 0, -0.03], null, 0.0105);
  h.userData = { F, t1, t2, side };
  setCurl(h, curl, thumbCurl);
  return h;
}
function setCurl(h, c, tc = 0.3) {
  for (const [k1, k2, k3] of h.userData.F) { k1.rotation.x = -c * 1.35; k2.rotation.x = -c * 1.55; k3.rotation.x = -c * 1.1; }
  h.userData.t1.rotation.x = -tc * 0.9; h.userData.t2.rotation.y = h.userData.side * tc * 0.9;
}
// right hand: fist wrapped around the sword grip, so it follows every swing
const rHand = buildHand(1, 1, 0.85);
{
  const HSCALE = 1.75, f = new THREE.Vector3(0.15, -0.6, 0.8).normalize(), up = new THREE.Vector3(0, 1, 0);
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
const REST = mkPose([0.44, -0.4, -0.75], [-0.55, 0.25, -0.12]);
const SWINGS = [
  [mkPose([0.62, -0.26, -0.62], [-0.15, 0.1, -1.45]), mkPose([-0.35, -0.36, -0.62], [-0.15, 2.5, -1.45])],
  [mkPose([-0.3, -0.26, -0.62], [-0.15, -0.1, 1.45]), mkPose([0.62, -0.36, -0.62], [-0.15, -2.5, 1.45])],
  [mkPose([0.38, -0.1, -0.6], [0.95, 0, 0]), mkPose([0.26, -0.62, -0.82], [-1.9, 0, 0])],
];
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
game.enemyBolt = (from, dmg, name, color = 0xff5a18, effect) => {
  v1.set(player.pos.x, player.pos.y + 1.2, player.pos.z).sub(from).normalize();
  spawnBolt(from, v1, 19, dmg, 'enemy', name, color, effect);
  flash(from, color, 30, 0.25); sfx.fire();
};
function explode(pos, dmg, direct) {
  burst(pos, 0xff7a22, 46, 9, 0.7, 5); burst(pos, 0xffd27a, 16, 4, 0.4, 0);
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
function hitMonster(m, dmg, kb) {
  const dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z, d = Math.hypot(dx, dz) || 1;
  const amount = dmg * player.dmgMul * (0.9 + Math.random() * 0.2);
  floatText(Math.round(amount), m.center, m.def.height, amount >= 30 * player.dmgMul);
  m.takeDamage(amount, game, dx / d, dz / d, kb);
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
  const y = heightAt(x, z);
  v1.set(x, y + 0.3, z);
  const dust = effect === 'chill' ? 0x8fe6ff : effect === 'burn' ? 0xff5a18 : 0xb89a6a;
  burst(v1, dust, 50, 9, 0.8, 12, 2); showRing(x, y, z, r, effect === 'chill' ? 0x66d8ff : 0xff9a4a); sfx.slam();
  const d = Math.hypot(player.pos.x - x, player.pos.z - z);
  if (d < 22) game.shake = Math.max(game.shake, 0.7 * (1 - d / 22));
  if (d < r && player.pos.y - heightAt(player.pos.x, player.pos.z) < 1) game.damagePlayer(dmg, from, name, 13, effect);
};

function startSwing() {
  if (player.stamina < 6) { sfx.deny(); return; }
  swing.active = true; swing.t = 0; swing.hitDone = false; swing.queued = false;
  swing.type = swing.combo % 3; swing.dur = swing.type === 2 ? 0.52 : 0.4;
  swing.combo++; swing.comboT = 1.1;
  player.stamina -= swing.type === 2 ? 11 : 7; player.staminaDelay = 0.6;
  sfx.swing();
}
function attack() { if (swing.active) { if (swing.t / swing.dur > 0.45) swing.queued = true; } else startSwing(); }
function swordHit() {
  camera.getWorldDirection(v1);
  const fx = v1.x, fz = v1.z, fl = Math.hypot(fx, fz) || 1;
  let any = false;
  for (const m of monsters.list) {
    if (m.dead) continue;
    const dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    const reach = 3.0 + m.def.radius;
    if (d > reach || Math.abs(m.center.y - (player.pos.y + 1.2)) > 3.2) continue;
    const dotp = (dx * fx + dz * fz) / ((d || 1) * fl);
    if (dotp < 0.3 && d > m.def.radius + 0.9) continue;
    hitMonster(m, swing.type === 2 ? 34 : 21, swing.type === 2 ? 2 : 1.1);
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
  const s = SPELLS[spell];
  if (player.mana < s.cost) { sfx.deny(); msg('Not enough mana'); castCd = 0.3; return; }
  player.mana -= s.cost; castCd = 0.55; orbKick = 1;
  if (spell === 0) {
    camera.getWorldDirection(v1);
    v2.copy(camera.position).addScaledVector(v1, 0.9);
    v3.set(-0.3, -0.18, 0).applyQuaternion(camera.quaternion); v2.add(v3);
    spawnBolt(v2, v1, 42, 36, 'player');
    flash(v2, 0xff8a33, 40, 0.2); sfx.fire();
  } else if (spell === 1) {
    const R = 10;
    for (const m of monsters.list) {
      if (m.dead || m.dist > R + m.def.radius) continue;
      hitMonster(m, 14, 0.5); m.slowT = 5.5;
      burst(m.center, 0x8fe6ff, 12, 3, 0.8, 1);
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * 6.283;
      v2.set(player.pos.x + Math.sin(a) * 2, player.pos.y + 0.5, player.pos.z + Math.cos(a) * 2);
      burst(v2, 0x8fe6ff, 2, 9, 0.7, 0);
    }
    showRing(player.pos.x, player.pos.y, player.pos.z, R, 0x66d8ff);
    flash(camera.position, 0x66d8ff, 90, 0.5); sfx.frost();
  } else {
    player.hp = Math.min(player.maxHp, player.hp + 40);
    camera.getWorldDirection(v1); v2.copy(camera.position).addScaledVector(v1, 2.6);
    burst(v2, 0x5cff8f, 16, 1.2, 1, -2, 2.2);
    game.healFx = 1; sfx.heal();
  }
}
function selectSpell(i) {
  spell = (i + 3) % 3;
  orbMat.emissive.set(SPELLS[spell].color); orbLight.color.set(SPELLS[spell].color);
  for (let k = 0; k < 3; k++) $('s' + k).classList.toggle('on', k === spell);
}
function eat() {
  if (player.meat <= 0) { msg('No meat — go hunt'); sfx.deny(); return; }
  if (player.hunger > 92 && player.hp >= player.maxHp) { msg('You are not hungry'); return; }
  player.meat--; player.hunger = Math.min(100, player.hunger + 34); player.hp = Math.min(player.maxHp, player.hp + 10);
  sfx.eat();
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
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (game.state !== 'playing' || game.paused) return;
  if (e.code === 'Digit1') selectSpell(0);
  else if (e.code === 'Digit2') selectSpell(1);
  else if (e.code === 'Digit3') selectSpell(2);
  else if (e.code === 'KeyF') eat();
  else if (e.code === 'KeyQ') dodge();
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement || game.paused) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * 0.0022));
});
addEventListener('mousedown', (e) => {
  if (game.state !== 'playing' || game.paused || document.pointerLockElement !== renderer.domElement) return;
  if (e.button === 0) attack(); else if (e.button === 2) cast();
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (game.state === 'playing' && !game.paused) selectSpell(spell + (e.deltaY > 0 ? 1 : -1)); });

let hadLock = false;
function lock() { try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignored */ } }
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked) { hadLock = true; game.paused = false; $('pause').style.display = 'none'; }
  else if (hadLock && game.state === 'playing') { game.paused = true; $('pause').style.display = 'flex'; }
});
$('start').addEventListener('click', () => {
  sfx.init();
  $('start').style.display = 'none'; $('hud').style.display = 'block';
  game.state = 'playing'; monsters.seed();
  if (touch.on) {
    try { const f = document.documentElement.requestFullscreen?.(); if (f && f.catch) f.catch(() => {}); } catch { /* ignored */ }
    try { const o = screen.orientation?.lock?.('landscape'); if (o && o.catch) o.catch(() => {}); } catch { /* ignored */ }
  } else lock();
  msg('Day 1 — hunt before the hunger takes you');
});
$('pause').addEventListener('click', lock);
$('dead').addEventListener('click', () => location.reload());
renderer.domElement.addEventListener('click', () => { if (game.state === 'playing' && !document.pointerLockElement && !touch.on) lock(); });

// ---------------------------------------------------------------- touchscreen
// Switched on by the first real touch, so mouse + keyboard players never see it.
const touch = { on: false, joyId: null, ox: 0, oy: 0, jx: 0, jy: 0, sprint: false, lookId: null, lx: 0, ly: 0, atk: false, jump: false };
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
      if (game.state === 'playing') {
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
bindBtn($('bAtk'), () => { touch.atk = true; attack(); }, () => { touch.atk = false; });
bindBtn($('bCast'), () => cast());
bindBtn($('bJump'), () => { touch.jump = true; }, () => { touch.jump = false; });
bindBtn($('bDodge'), () => dodge());
bindBtn($('bEat'), () => eat());
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
  setText('meat', player.meat); setText('kills', player.kills); setText('lvl', player.level);
  $('xpf').style.width = (player.essence / needEssence() * 100) + '%';
  const part = dayT < 0.06 ? 'Dawn' : dayT < 0.42 ? 'Day' : dayT < 0.5 ? 'Dusk' : 'Night';
  setText('day', `${MAPS[game.mapId].name} · Day ${game.day} · ${part}`);
  $('hurt').style.opacity = Math.max(game.hurtFx, player.hunger <= 0 ? 0.35 : 0, player.hp < 30 ? 0.3 : 0);
  $('heal').style.opacity = game.healFx;
  $('chill').style.opacity = player.chillT > 0 ? Math.min(1, player.chillT) * 0.8 : 0;
  drawMinimap();
}
function die(cause) {
  if (game.state === 'dead') return;
  game.state = 'dead'; sfx.die();
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
  if (touch.atk && (!swing.active || swing.t / swing.dur > 0.45) && p.stamina >= 6) attack();
  if (touch.on) stick.classList.toggle('sprint', sprint);
  let tx, tz;
  p.dodgeCd -= dt;
  if (p.dodgeT > 0) { p.dodgeT -= dt; tx = p.dodgeX * 19; tz = p.dodgeZ * 19; }
  else { const sp = (sprint ? 10.5 : 6) * (p.chillT > 0 ? 0.6 : 1); tx = mx * sp; tz = mz * sp; }
  const k = Math.min(1, dt * (p.onGround ? 12 : 3));
  p.vel.x += (tx - p.vel.x) * k; p.vel.z += (tz - p.vel.z) * k;
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
    if (p.pos.y <= ground) { p.pos.y = ground; p.vel.y = 0; p.onGround = true; sfx.step(); }
  }
  // vitals
  if (sprint) { p.stamina -= 15 * dt; p.staminaDelay = 0.7; }
  p.staminaDelay -= dt;
  if (p.staminaDelay <= 0) p.stamina += 24 * dt;
  p.stamina = Math.max(0, Math.min(100, p.stamina));
  p.mana = Math.min(100, p.mana + 3.5 * dt);
  p.hunger = Math.max(0, p.hunger - (0.42 + (sprint ? 0.3 : 0)) * dt);
  if (p.hunger <= 0) { p.hp -= 2.6 * dt; if (p.hp <= 0) die('Starved in the wilds'); }
  else if (p.hunger > 50 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1.3 * dt);
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
  // camera
  game.shake = Math.max(0, game.shake - dt * 1.6);
  const sh = game.shake * game.shake;
  camera.position.set(p.pos.x + (Math.random() - 0.5) * sh * 0.5, p.pos.y + EYE + Math.sin(p.bob * 2) * 0.045 + (Math.random() - 0.5) * sh * 0.5, p.pos.z);
  camera.rotation.set(p.pitch + (Math.random() - 0.5) * sh * 0.06, p.yaw, (Math.random() - 0.5) * sh * 0.06 - (p.dodgeT > 0 ? 0.06 : 0));
  const fov = sprint ? 84 : 75;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 7); camera.updateProjectionMatrix(); }
  // viewmodel
  poseSword();
  const sway = Math.sin(p.bob) * 0.012 * Math.min(1, hs / 6);
  vm.position.set(sway, Math.abs(Math.cos(p.bob)) * 0.012 * Math.min(1, hs / 6) - (p.onGround ? 0 : 0.02), 0);
  orbKick = Math.max(0, orbKick - dt * 4);
  const t = game.time;
  const kick = Math.sin(orbKick * Math.PI);
  lArm.position.set(-0.44 + kick * 0.1, -0.4 + Math.sin(t * 1.6) * 0.006 + kick * 0.12, -0.72 - kick * 0.28);
  lArm.rotation.set(0.35 + kick * 0.5, 0.3, -0.15);
  setCurl(lHand, 0.22 - kick * 0.2, 0.1);
  orb.rotation.set(t, t * 1.3, 0); orbRing.rotation.y = t * 3; orb.position.y = -0.095 + Math.sin(t * 2.3) * 0.006;
  orbMat.emissiveIntensity = 1.5 + Math.sin(t * 5) * 0.25 + orbKick * 5 - (player.mana < SPELLS[spell].cost ? 1.2 : 0);
  orbLight.intensity = (game.isNight ? 2.2 : 0.8) + orbKick * 6;
}

function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i], bp = b.mesh.position;
    bp.addScaledVector(b.vel, dt); b.life -= dt;
    burst(bp, b.owner === 'player' ? 0xff7a22 : b.color, 2, 0.8, 0.35, -1, 0.15);
    let done = b.life <= 0, direct = null;
    if (bp.y < heightAt(bp.x, bp.z) + 0.1) done = true;
    if (b.owner === 'player') {
      for (const m of monsters.list) {
        if (!m.dead && m.center.distanceTo(bp) < m.def.radius + 0.55) { direct = m; done = true; break; }
      }
      if (done) explode(bp, b.dmg, direct);
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
}
let ambAcc = 0;
/** Weather: snowfall on the tundra, rising embers in the wastes, fireflies in the vale at night. */
function ambient(dt) {
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

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let menuAngle = 0, lastDayT = 0.07;
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, clock.getDelta());
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
  composer.render();
}
game.debug = { attack, cast, selectSpell, eat, dodge, travel };
selectSpell(0);
frame();
