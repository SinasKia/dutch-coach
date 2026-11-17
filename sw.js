// Service worker: makes the app shell and lesson packs available offline.
// Bump VERSION whenever app files change; the old cache is then replaced.
const VERSION = 'dutch-coach-v1.0.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/screens.js', 'js/activities.js', 'js/router.js', 'js/store.js', 'js/ui.js', 'js/speech.js', 'js/ext/ai.js',
  'js/engine/text.js', 'js/engine/srs.js', 'js/engine/exercises.js', 'js/engine/analysis.js', 'js/engine/packs.js', 'js/engine/learner.js', 'js/engine/conversation.js',
  'content/index.json', 'content/core-vocab.json', 'content/core-grammar.json', 'content/core-listening.json', 'content/core-speaking.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const refresh = fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  });
  // Pack index: network first, so content updates are noticed. Everything else: cache first for
  // instant startup, refreshed in the background (the new version is used on the next launch).
  if (url.pathname.endsWith('content/index.json')) {
    e.respondWith(refresh.catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || refresh.catch(() => caches.match('index.html'))));
    e.waitUntil(refresh.catch(() => {}));
  }
});
