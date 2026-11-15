// Service worker: makes the game installable and playable offline.
// Bump VERSION whenever files change so installed copies pick up the update.
const VERSION = 'ezhunter-v9';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './src/main.js', './src/world.js', './src/monsters.js', './src/audio.js', './src/net.js', './src/music.js', './src/chibi.js',
  './icons/icon-192.png', './icons/icon-512.png',
];
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';
const CDN_FILES = [
  'build/three.module.js',
  'examples/jsm/postprocessing/EffectComposer.js', 'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js', 'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
].map((f) => CDN + f);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    await c.addAll(SHELL);
    await Promise.allSettled(CDN_FILES.map((u) => c.add(u))); // best effort; the rest is cached on first use
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const put = (res) => { if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; };
  if (url.origin === location.origin) {
    // own files: network first so updates arrive, cache when offline
    e.respondWith(fetch(req).then(put).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
  } else if (req.url.startsWith(CDN)) {
    // pinned library version never changes: cache first
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then(put)));
  }
});
