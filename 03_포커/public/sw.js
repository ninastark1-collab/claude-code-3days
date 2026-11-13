// 앱 설치용 서비스 워커.
// 게임은 항상 최신 버전을 받도록 '네트워크 우선 + 브라우저 캐시도 건너뜀'.
// 인터넷이 끊겼을 때만 마지막으로 받은 첫 화면을 보여줌.
const CACHE = 'memory-poker-v3';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add(new Request('/', { cache: 'no-store' }))).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // 게임 데이터·서버 통신은 손대지 않음
  e.respondWith(
    fetch(e.request.url, { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match('/')),
  );
});
