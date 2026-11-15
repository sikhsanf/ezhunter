// Co-op for up to three hunters, peer-to-peer over WebRTC (PeerJS). No game server, no login.
//
// One player hosts a room and shares a 4-letter code; two more can join. The host's device runs the monsters
// for its map. Guests in that same map see mirrored copies and send their hits to the host; guests who walk
// through a waygate to another map simply run that map themselves until they come back.
//
// Messages (t = type):  you / hello / left / full / bye   room membership
//                       pos                               a player's position and pose, ~15 per second
//                       mons                              host → guests: snapshot of every monster in the host's map
//                       hit                               guest → host: damage a guest dealt
//                       hurt / slam / eb                  host → guests: a monster hit you / slammed / fired a bolt
//                       sv                                a player's arrow or spell, shown to the others
//                       pg                                ping
import * as THREE from 'three';
import { buildChibi } from './chibi.js';

const PEER_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const CODE_AL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alike letters
const PREFIX = 'ezh-', MAXP = 3, SEND_MS = 66, PING_MS = 2500, DEAD_MS = 15000, RECON_MS = 35000;
const SLOT_COL = [0x3b6fb0, 0xb0503b, 0x3ba06a];
const STATES = ['wander', 'flee', 'chase', 'windup', 'strike', 'recover'];
const EFFECTS = { chill: 1, burn: 1 };

/** Never trust a number from the network: coerce, reject NaN, clamp. */
const num = (v, lo, hi, d = 0) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const cleanName = (n) => String(n || '').replace(/[^\w \-]/g, '').trim().slice(0, 12) || 'Hunter';
const $ = (id) => document.getElementById(id);

export function createCoop(ctx) {
  const { game, player, scene, monsters, MAPS, TYPES, CLASSES, heightAt, msg } = ctx;
  const C = { role: null, st: 'idle', code: '', err: '', me: 0, peer: null, conn: null, Rs: {}, hostMap: '', mirror: false, name: 'Hunter', seen: 0, rc: null, tick: 0 };
  try { C.name = cleanName(localStorage.getItem('ezhunter-name')); } catch { /* storage unavailable */ }

  const list = () => Object.values(C.Rs);
  const on = () => C.st === 'on';
  const now = () => performance.now();
  function rawSend(c, o) { if (c && c.open !== false) { try { c.send(o); } catch { /* connection going away */ } } }
  function send(o) { if (C.role === 'host') list().forEach((R) => rawSend(R.conn, o)); else rawSend(C.conn, o); }
  /** Host: send to the guests standing in the host's map. */
  function sendMap(o) { if (C.role === 'host') list().forEach((R) => { if (R.map === game.mapId) rawSend(R.conn, o); }); }

  function loadPeer(ok, bad) {
    if (window.Peer) return ok();
    const s = document.createElement('script');
    s.src = PEER_URL; s.onload = () => (window.Peer ? ok() : bad()); s.onerror = bad;
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------- remote players
  function mkR(slot, conn) {
    return C.Rs[slot] = { slot, conn: conn || null, name: '', cls: null, map: '', pos: new THREE.Vector3(), tx: 0, ty: 0, tz: 0, f: 0, tf: 0,
      b: 0, bl: 0, dr: 0, a: -1, atkT: 0, hp: 100, hm: 100, seen: now(), av: null, first: true, phase: 0, tagHp: -1 };
  }
  function dropAvatar(R) {
    if (!R.av) return;
    scene.remove(R.av.g);
    R.av.g.traverse((o) => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    R.av = null;
  }
  function dropR(R) { dropAvatar(R); delete C.Rs[R.slot]; }
  function dropAll() { list().forEach(dropR); }
  const profile = () => ({ n: C.name, c: player.cls });
  function setRemote(R, p) {
    if (!p || !CLASSES[p.c]) return false;
    const fresh = !R.cls, name = cleanName(p.n);
    if (R.cls !== p.c || R.name !== name) { dropAvatar(R); R.cls = p.c; R.name = name; R.av = buildAvatar(R); scene.add(R.av.g); R.av.g.visible = false; }
    if (fresh) msg(`${name} joined the hunt`);
    render();
    return true;
  }
  function onPos(R, d) {
    R.tx = num(d.x, -420, 420); R.ty = num(d.y, -200, 200); R.tz = num(d.z, -420, 420); R.tf = num(d.f, -1e4, 1e4);
    R.map = typeof d.m === 'string' && MAPS[d.m] ? d.m : '';
    R.b = d.b ? 1 : 0; R.bl = d.bl ? 1 : 0; R.dr = d.dr ? 1 : 0;
    R.hp = num(d.h, 0, 9999); R.hm = num(d.hm, 1, 9999, 100);
    const a = num(d.a, 0, 1e9);
    if (R.a >= 0 && a !== R.a) R.atkT = 0.4; // they swung, shot or cast
    R.a = a;
    if (R.first) { R.pos.set(R.tx, R.ty, R.tz); R.f = R.tf; R.first = false; }
  }

  // ---------------------------------------------------------------- hosting
  function stop() {
    const p = C.peer, cs = C.role === 'host' ? list().map((R) => R.conn) : [C.conn];
    C.peer = null; C.conn = null;
    cs.forEach((c) => { if (c) { try { c.send({ t: 'bye' }); } catch { /* */ } try { c.close(); } catch { /* */ } } });
    if (p) { try { p.destroy(); } catch { /* */ } }
    dropAll();
    C.role = null; C.st = 'idle'; C.code = ''; C.err = ''; C.me = 0; C.hostMap = ''; C.rc = null;
    render();
  }
  function fail(text) { stop(); C.st = 'err'; C.err = text; render(); }
  function host(tries = 0) {
    C.role = 'host'; C.st = 'wait'; C.err = ''; C.me = 0; C.open = false; render();
    loadPeer(() => {
      const code = Array.from({ length: 4 }, () => CODE_AL[Math.random() * CODE_AL.length | 0]).join('');
      let p;
      try { p = new window.Peer(PREFIX + code); } catch { return fail('Could not reach the co-op service.'); }
      C.peer = p; C.code = code;
      p.on('open', () => { C.open = true; render(); });
      p.on('connection', (c) => {
        c.on('open', () => {
          const slot = [1, 2].find((s) => !C.Rs[s]);
          if (!slot) { rawSend(c, { t: 'full' }); setTimeout(() => { try { c.close(); } catch { /* */ } }, 400); return; }
          hostAttach(c, slot);
        });
      });
      p.on('error', (e) => {
        if (e && e.type === 'unavailable-id' && tries < 5) { try { p.destroy(); } catch { /* */ } C.peer = null; host(tries + 1); return; } // code taken: roll again
        if (on()) return;
        fail('Could not reach the co-op service.');
      });
      p.on('disconnected', () => { try { p.reconnect(); } catch { /* */ } });
    }, () => fail('Co-op needs an internet connection.'));
  }
  function hostAttach(c, slot) {
    const R = mkR(slot, c);
    C.st = 'on';
    c.on('data', (d) => { try { hostMsg(R, d); } catch (e) { console.error(e); } });
    c.on('close', () => hostLost(R)); c.on('error', () => hostLost(R));
    rawSend(c, { t: 'you', s: slot });
    rawSend(c, { t: 'hello', s: 0, p: profile() });
    list().forEach((o) => { if (o !== R && o.cls) rawSend(c, { t: 'hello', s: o.slot, p: { n: o.name, c: o.cls } }); });
    render();
  }
  function hostLost(R) {
    if (C.Rs[R.slot] !== R) return;
    const had = R.cls, name = R.name;
    try { if (R.conn) R.conn.close(); } catch { /* */ }
    dropR(R);
    list().forEach((o) => rawSend(o.conn, { t: 'left', s: R.slot }));
    if (!list().length) C.st = 'wait';
    if (had) msg(`${name} left the hunt`);
    render();
  }
  function relay(R, d) { const o = Object.assign({}, d, { s: R.slot }); list().forEach((x) => { if (x !== R) rawSend(x.conn, o); }); }
  function hostMsg(R, d) {
    if (!d || typeof d !== 'object') return;
    R.seen = now();
    switch (d.t) {
      case 'pg': rawSend(R.conn, { t: 'pg' }); break;
      case 'hello': if (setRemote(R, d.p)) list().forEach((o) => { if (o !== R) rawSend(o.conn, { t: 'hello', s: R.slot, p: { n: R.name, c: R.cls } }); }); break;
      case 'pos': onPos(R, d); if (R.cls) relay(R, d); break;
      case 'sv': if (R.cls) { onShot(R, d); relay(R, d); } break;
      case 'hit': onHit(R, d); break;
      case 'bye': hostLost(R); break;
    }
  }
  /** A guest says it hit a monster: the host applies it, so everyone sees the same health. */
  function onHit(R, d) {
    if (R.map !== game.mapId) return;
    const id = num(d.id, 0, 1e9), m = monsters.list.find((x) => x.id === id);
    if (!m || m.dead) return;
    const dx = m.pos.x - R.pos.x, dz = m.pos.z - R.pos.z, l = Math.hypot(dx, dz) || 1;
    if (d.sl) m.slowT = num(d.sl, 0, 6);
    if (d.st && m.def.mass < 1 && m.state !== 'wander' && m.state !== 'flee') { m.state = 'recover'; m.timer = 1.2; }
    m.takeDamage(num(d.d, 0, 500), game, dx / l, dz / l, num(d.kb, 0, 4));
  }

  // ---------------------------------------------------------------- joining
  function join(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { C.st = 'err'; C.err = 'Enter the 4-letter room code.'; render(); return; }
    C.role = 'guest'; C.st = 'joining'; C.code = code; C.err = ''; render();
    loadPeer(() => {
      let p;
      try { p = new window.Peer(); } catch { return fail('Could not reach the co-op service.'); }
      C.peer = p;
      let done = false;
      const to = setTimeout(() => { if (!done) fail('No room with that code.'); }, 12000);
      p.on('open', () => {
        const c = p.connect(PREFIX + code, { reliable: true });
        c.on('open', () => { done = true; clearTimeout(to); guestAttach(c); });
        c.on('error', () => {});
      });
      p.on('error', (e) => { if (done && on()) return; clearTimeout(to); fail(e && e.type === 'peer-unavailable' ? 'No room with that code.' : 'Could not reach the co-op service.'); });
    }, () => fail('Co-op needs an internet connection.'));
  }
  function guestAttach(c) {
    C.conn = c; C.st = 'on'; C.rc = null; C.seen = now(); C.hostMap = '';
    dropAll();
    c.on('data', (d) => { try { guestMsg(d); } catch (e) { console.error(e); } });
    c.on('close', () => guestLost(c)); c.on('error', () => guestLost(c));
    rawSend(c, { t: 'hello', p: profile() });
    render();
  }
  /** Connection dropped: keep trying to get back in for a while before giving up (phones switch apps a lot). */
  function guestLost(c, hard) {
    if (C.conn !== c) return;
    if (!hard && C.role === 'guest' && C.code) {
      try { c.close(); } catch { /* */ }
      C.conn = null; dropAll(); C.st = 'recon'; C.hostMap = ''; C.rc = { t0: now() };
      msg('Connection lost — reconnecting…');
      render(); rcAttempt();
      return;
    }
    guestEnd();
  }
  function guestEnd() {
    const p = C.peer;
    C.peer = null; C.conn = null; C.rc = null;
    if (p) { try { p.destroy(); } catch { /* */ } }
    dropAll(); C.role = null; C.st = 'idle'; C.code = ''; C.hostMap = '';
    msg('Co-op ended — hunting alone');
    render();
  }
  function rcRetry() { if (C.st === 'recon' && C.rc) setTimeout(rcAttempt, 1500); }
  function rcAttempt() {
    if (C.role !== 'guest' || C.st !== 'recon' || !C.rc) return;
    if (now() - C.rc.t0 > RECON_MS) { guestEnd(); return; }
    const old = C.peer; C.peer = null;
    if (old) { try { old.destroy(); } catch { /* */ } }
    let p;
    try { p = new window.Peer(); } catch { rcRetry(); return; }
    C.peer = p;
    let ok = false;
    const to = setTimeout(() => { if (ok) return; try { p.destroy(); } catch { /* */ } if (C.peer === p) C.peer = null; rcRetry(); }, 7000);
    p.on('open', () => {
      if (C.st !== 'recon') return;
      const c = p.connect(PREFIX + C.code, { reliable: true });
      c.on('open', () => { if (C.st !== 'recon') { try { c.close(); } catch { /* */ } return; } ok = true; clearTimeout(to); guestAttach(c); msg('Reconnected'); });
      c.on('error', () => {});
    });
    p.on('error', () => {});
  }
  function guestMsg(d) {
    if (!d || typeof d !== 'object') return;
    C.seen = now();
    const sl = num(d.s, 0, 2) | 0;
    switch (d.t) {
      case 'full': fail('That room is full.'); break;
      case 'you': C.me = num(d.s, 1, 2) | 0; break;
      case 'hello': if (sl !== C.me) setRemote(C.Rs[sl] || mkR(sl, null), d.p); break;
      case 'pos': {
        const R = C.Rs[sl];
        if (!R || sl === C.me) break;
        onPos(R, d);
        if (sl === 0) { // the host also carries the shared clock and tells us which map it is running
          C.hostMap = R.map;
          const tm = num(d.tm, 0, 1e8, -1);
          if (tm >= 0 && Math.abs(tm - game.time) > 1.5) game.time = tm;
        }
        break;
      }
      case 'left': { const R = C.Rs[sl]; if (R) { if (R.cls) msg(`${R.name} left the hunt`); dropR(R); render(); } break; }
      case 'mons': onMons(d); break;
      case 'hurt': if (game.state === 'playing') game.damagePlayer(num(d.a, 0, 300), { x: num(d.x, -500, 500), z: num(d.z, -500, 500) }, cleanName(d.n), num(d.k, 0, 20), EFFECTS[d.e] ? d.e : undefined); break;
      case 'slam': if (C.mirror) ctx.localSlam(num(d.x, -500, 500), num(d.z, -500, 500), num(d.r, 0, 12), num(d.a, 0, 300), cleanName(d.n), { x: num(d.fx, -500, 500), z: num(d.fz, -500, 500) }, EFFECTS[d.e] ? d.e : undefined); break;
      case 'eb': if (C.mirror && Array.isArray(d.o) && Array.isArray(d.v)) ctx.enemyShot(vec(d.o, 500), vec(d.v, 60), num(d.a, 0, 300), cleanName(d.n), num(d.c, 0, 0xffffff), EFFECTS[d.e] ? d.e : undefined); break;
      case 'sv': { const R = C.Rs[sl]; if (R && sl !== C.me) onShot(R, d); break; }
      case 'pg': break;
      case 'bye': guestLost(C.conn, true); break;
    }
  }
  const vec = (a, lim) => new THREE.Vector3(num(a[0], -lim, lim), num(a[1], -lim, lim), num(a[2], -lim, lim));
  function onShot(R, d) {
    if (R.map !== game.mapId || !Array.isArray(d.o) || !Array.isArray(d.v)) return;
    ctx.ghostShot(d.k === 'arrow' ? 'arrow' : d.k === 'arcane' ? 'arcane' : 'fire', vec(d.o, 500), vec(d.v, 120));
  }

  // ---------------------------------------------------------------- monsters: host snapshot → guest mirrors
  function snapshot() {
    const l = [];
    for (const m of monsters.list) {
      if (m.remove) continue;
      l.push([m.id, m.type, r1(m.pos.x), r1(m.pos.z), r2(m.face), Math.max(0, Math.round(m.hp)), m.dead ? 6 : STATES.indexOf(m.state), m.slowT > 0 ? 1 : 0,
        m.state === 'windup' ? r2(1 - m.timer / m.def.windup) : 0]);
    }
    return { t: 'mons', m: game.mapId, l };
  }
  function onMons(d) {
    if (!C.mirror || d.m !== game.mapId || !Array.isArray(d.l)) return;
    const seen = new Set();
    for (const e of d.l.slice(0, 80)) {
      if (!Array.isArray(e) || !TYPES[e[1]]) continue;
      const id = num(e[0], 1, 1e9), x = num(e[2], -420, 420), z = num(e[3], -420, 420), code = num(e[6], 0, 6) | 0;
      let m = monsters.list.find((q) => q.id === id);
      if (!m) {
        if (code === 6) continue; // already dead before we ever saw it
        m = monsters.spawn(e[1], x, z); m.id = id; m.face = num(e[4], -1e4, 1e4); m.tf = m.face;
      }
      seen.add(m);
      m.tx = x; m.tz = z; m.tf = num(e[4], -1e4, 1e4);
      const hp = num(e[5], 0, 1e5);
      if (hp < m.hp - 0.5 && !m.dead) { m.flashT = 0.1; m.hp = hp; m.showBar(); } else m.hp = hp;
      if (code === 6) { if (!m.dead) m.die(game, true); }
      else if (!m.dead) { m.state = STATES[code] || 'wander'; m.slowT = e[7] ? 1 : 0; m.wind = num(e[8], 0, 1); }
    }
    for (const m of monsters.list) if (!seen.has(m) && !m.dead) m.remove = true; // gone on the host
  }

  // ---------------------------------------------------------------- ticking
  setInterval(() => {
    if (!on() || game.state !== 'playing') return;
    const p = player, o = { t: 'pos', x: r2(p.pos.x), y: r2(p.pos.y), z: r2(p.pos.z), f: r2(p.yaw), m: game.mapId, b: p.battle ? 1 : 0, bl: p.blocking ? 1 : 0, dr: p.drawing ? 1 : 0,
      a: p.atkSeq || 0, h: Math.round(Math.max(0, p.hp)), hm: Math.round(p.maxHp) };
    if (C.role === 'host') { o.s = 0; o.tm = r1(game.time); }
    send(o);
    if (C.role === 'host' && (C.tick++ & 1)) { const s = snapshot(); sendMap(s); }
  }, SEND_MS);
  setInterval(() => {
    const t = now();
    if (C.role === 'guest' && C.st === 'on' && C.conn) { rawSend(C.conn, { t: 'pg' }); if (t - C.seen > DEAD_MS) guestLost(C.conn); }
    else if (C.role === 'host') list().forEach((R) => { if (R.conn && t - R.seen > DEAD_MS) hostLost(R); });
  }, PING_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const t = now();
    if (C.role === 'guest' && C.st === 'on' && C.conn) { C.seen = t; if (C.conn.open === false) guestLost(C.conn); else rawSend(C.conn, { t: 'pg' }); }
    else if (C.role === 'guest' && C.st === 'recon') rcAttempt();
    else if (C.role === 'host') list().forEach((R) => { R.seen = t - 8000; }); // give returning guests some slack
  });

  /** Every frame: glide the other hunters toward their latest position, animate them, switch mirror mode. */
  function frame(dt) {
    const want = C.role === 'guest' && C.st === 'on' && !!C.hostMap && C.hostMap === game.mapId && game.state === 'playing';
    if (want !== C.mirror) {
      C.mirror = want;
      monsters.clear(); game.lock = null;
      if (!want && game.state === 'playing') monsters.seed(); // on our own again: run this map ourselves
    }
    const k = Math.min(1, dt * 12);
    for (const R of list()) {
      const ox = R.pos.x, oz = R.pos.z;
      R.pos.x += (R.tx - R.pos.x) * k; R.pos.y += (R.ty - R.pos.y) * k; R.pos.z += (R.tz - R.pos.z) * k;
      let df = (R.tf - R.f) % (Math.PI * 2);
      if (df > Math.PI) df -= Math.PI * 2; else if (df < -Math.PI) df += Math.PI * 2;
      R.f += df * k;
      R.atkT = Math.max(0, R.atkT - dt);
      const av = R.av;
      if (!av) continue;
      av.g.visible = R.map === game.mapId && R.hp > 0;
      if (!av.g.visible) continue;
      const speed = Math.hypot(R.pos.x - ox, R.pos.z - oz) / Math.max(dt, 1e-3), sw = Math.min(1, speed / 5);
      R.phase += dt * (2 + speed * 1.5);
      av.g.position.copy(R.pos); av.g.rotation.y = R.f + Math.PI;
      const sn = Math.sin(R.phase), cs = Math.cos(R.phase);
      av.legs.forEach((l, i) => { const q = i ? -sn : sn; l.g.rotation.x = q * 0.6 * sw; l.kn.rotation.x = 0.1 + Math.max(0, i ? cs : -cs) * 1.0 * sw; l.ft.rotation.x = -(l.g.rotation.x + l.kn.rotation.x) * 0.7; });
      const hit = R.atkT > 0 ? Math.sin((1 - R.atkT / 0.4) * Math.PI) : 0;
      let ra = -Math.sin(R.phase) * 0.5 * sw, la = Math.sin(R.phase) * 0.5 * sw;
      if (R.b) { ra = -0.9; la = -0.5; }
      if (R.cls === 'archer' && (R.dr || R.atkT > 0)) { la = -1.5; ra = -1.3 + hit * 0.4; }
      else ra -= hit * 1.3;
      if (R.bl) la = -1.4;
      av.arms[0].g.rotation.set(la, 0, -0.14); av.arms[1].g.rotation.set(ra, 0, 0.14);
      av.arms[0].el.rotation.x = R.bl ? -1.2 : la < -0.6 ? -0.5 : -0.25; av.arms[1].el.rotation.x = R.b ? -0.9 + hit * 0.6 : -0.3;
      av.hips.position.y = av.hipY + Math.abs(cs) * 0.05 * av.unit * sw;
      av.torso.rotation.set(0.06 * sw, sn * 0.07 * sw, 0); av.head.rotation.z = Math.sin(R.phase * 0.12) * 0.04;
      const hpPct = Math.round(R.hp / R.hm * 20);
      if (hpPct !== R.tagHp) { R.tagHp = hpPct; drawTag(av, R); }
    }
  }

  // ---------------------------------------------------------------- avatars
  function buildAvatar(R) {
    const av = buildChibi(R.cls, SLOT_COL[R.slot % 3]);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 72;
    av.cv = cv; av.tex = new THREE.CanvasTexture(cv);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: av.tex, depthWrite: false, fog: false, transparent: true }));
    tag.scale.set(1.9, 0.53, 1); tag.position.y = av.height + 0.55; tag.renderOrder = 10; av.g.add(tag);
    drawTag(av, R);
    return av;
  }
  function drawTag(av, R) {
    const c = av.cv.getContext('2d');
    c.clearRect(0, 0, 256, 72);
    c.font = '600 30px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.85)'; c.strokeText(R.name, 128, 26);
    c.fillStyle = '#' + SLOT_COL[R.slot % 3].toString(16).padStart(6, '0'); c.fillStyle = '#f1e8d8'; c.fillText(R.name, 128, 26);
    c.fillStyle = 'rgba(0,0,0,.75)'; c.fillRect(48, 50, 160, 12);
    c.fillStyle = '#e2422c'; c.fillRect(50, 52, 156 * Math.max(0, Math.min(1, R.hp / R.hm)), 8);
    av.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- panel + status pill
  function render() {
    const pill = $('coopPill'), st = $('coopStatus');
    if (!pill) return;
    const n = 1 + list().filter((R) => R.cls).length;
    pill.textContent = C.st === 'on' || C.st === 'wait' ? `Co-op ${C.code} · ${n}/${MAXP}` : C.st === 'recon' ? 'Reconnecting…' : C.st === 'joining' ? 'Joining…' : 'Co-op';
    pill.classList.toggle('on', C.st === 'on' || C.st === 'wait');
    const active = C.role !== null && C.st !== 'err';
    $('coopForm').style.display = active ? 'none' : 'block';
    $('coopRoom').style.display = active ? 'block' : 'none';
    $('coopCodeBig').textContent = C.code || '····';
    st.textContent = C.st === 'err' ? C.err
      : C.st === 'wait' ? (C.open ? 'Room open. Share this code with your friends.' : 'Opening room…')
      : C.st === 'joining' ? 'Looking for the room…'
      : C.st === 'recon' ? 'Connection lost — trying to get back in…'
      : C.st === 'on' ? (C.role === 'host' ? 'You are hosting. Monsters in your map run on this device.' : 'Connected. Stay in the same map as the host to hunt together.')
      : 'Hunt with up to two friends. One creates a room, the others enter its code.';
    const who = $('coopWho');
    who.textContent = '';
    if (active) [{ name: `${C.name} (you)`, cls: player.cls }].concat(list().filter((R) => R.cls)).forEach((R) => {
      const d = document.createElement('div');
      d.textContent = `${R.name} — ${CLASSES[R.cls].name}${R.map && R.map !== game.mapId ? ` · ${MAPS[R.map].name}` : ''}`;
      who.appendChild(d);
    });
  }
  function setName(n) { C.name = cleanName(n); try { localStorage.setItem('ezhunter-name', C.name); } catch { /* */ } }

  return {
    get mirror() { return C.mirror; }, get role() { return C.role; }, get state() { return C.st; }, get code() { return C.code; }, get name() { return C.name; },
    on, host, join, leave: stop, frame, render, setName,
    remotes: () => list().filter((R) => R.cls),
    /** Host: every living hunter in the host's map, for monster targeting and spawning. */
    targets() {
      const out = [player];
      if (C.role === 'host') for (const R of list()) if (R.cls && R.map === game.mapId && R.hp > 0) out.push(R);
      return out;
    },
    hurt(R, dmg, from, name, kb, effect) { rawSend(R.conn, { t: 'hurt', a: Math.round(dmg), x: r1(from.x), z: r1(from.z), n: name, k: kb, e: effect }); },
    /** Guest: report damage dealt to a mirrored monster. */
    sendHit(m, amount, kb, opt) { rawSend(C.conn, { t: 'hit', id: m.id, d: r1(amount), kb, sl: opt && opt.slow, st: opt && opt.stun ? 1 : 0 }); },
    slam(x, z, r, dmg, name, from, effect) { sendMap({ t: 'slam', x: r1(x), z: r1(z), r, a: dmg, n: name, fx: r1(from.x), fz: r1(from.z), e: effect }); },
    enemyBolt(o, v, dmg, name, color, effect) { sendMap({ t: 'eb', o: [r1(o.x), r1(o.y), r1(o.z)], v: [r2(v.x), r2(v.y), r2(v.z)], a: dmg, n: name, c: color, e: effect }); },
    shot(kind, o, v) { if (on()) send({ t: 'sv', k: kind, o: [r1(o.x), r1(o.y), r1(o.z)], v: [r1(v.x), r1(v.y), r1(v.z)] }); },
  };
}
