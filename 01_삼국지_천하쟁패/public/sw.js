/*
 * 폰 웹앱(PWA) 오프라인 캐시. 한 번 열어 둔 화면·글꼴·음악 코드는 기기에 남아 인터넷 없이도 실행된다.
 * - 화면(HTML): 네트워크 우선 → 새 버전이 올라가면 바로 반영, 끊기면 캐시
 * - 그 밖의 파일(이름에 해시가 붙은 js·css·글꼴): 캐시 우선
 */
const CACHE = 'samgukji-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
