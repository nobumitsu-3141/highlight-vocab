/* ハイライト英単語帳 — service worker
   大きな固定ファイル(dict.js / pdf.js / icons)はキャッシュ優先、
   index.html などはネットワーク優先(オフライン時キャッシュ)。 */
const CACHE = 'hlvocab-v1';
const ASSETS = [
  './',
  'index.html',
  'dict.js',
  'lib/pdf.min.js',
  'lib/pdf.worker.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];
// キャッシュ優先で返すパス（内容がほぼ変わらない大きなファイル）
const CACHE_FIRST = /(dict\.js|lib\/|icons\/)/;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('hlvocab-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 外部API(辞書API等)はSWで触らない

  if (CACHE_FIRST.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      }))
    );
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
