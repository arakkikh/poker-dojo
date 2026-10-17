// オフライン対応。通信できるときは常に最新を取得し、できないときだけキャッシュを使う（ネットワーク優先）。
// ファイルを追加・削除したら FILES を更新する（tests でチェックしている）。

const CACHE = 'poker-dojo-v1';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/base.css',
  './css/table.css',
  './js/ai/advisor.js',
  './js/ai/cpu.js',
  './js/ai/memory.js',
  './js/ai/personalities.js',
  './js/ai/preflop.js',
  './js/content/drills.js',
  './js/content/lessons.js',
  './js/content/missions.js',
  './js/core/cards.js',
  './js/core/equity.js',
  './js/core/evaluator.js',
  './js/core/game.js',
  './js/core/tournament.js',
  './js/main.js',
  './js/store/storage.js',
  './js/ui/cards.js',
  './js/ui/drill.js',
  './js/ui/equityClient.js',
  './js/ui/home.js',
  './js/ui/lesson.js',
  './js/ui/missions.js',
  './js/ui/setup.js',
  './js/ui/stats.js',
  './js/ui/table.js',
  './js/ui/theme.js',
  './js/ui/util.js',
  './js/workers/equity.worker.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
