/* TEPS 트레이너 — 오프라인 지원 서비스 워커 (네트워크 우선, 실패 시 캐시) */
const CACHE = 'teps-trainer-v2';
const ASSETS = [
  '.',
  'index.html',
  'css/style.css',
  'js/app.js',
  'data/low.js',
  'data/mid.js',
  'data/high.js',
  'manifest.webmanifest',
  'icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
