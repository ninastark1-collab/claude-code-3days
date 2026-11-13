// 고구마마켓 서비스 워커: 사이트를 닫아 둬도 뒤에서 푸시 알림을 받아 보여 줘요.
// (서비스 워커 = 브라우저가 사이트 대신 뒤에서 돌려 주는 작은 프로그램)

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : "" };
  }
  const url = d.url || "/";
  event.waitUntil(
    (async () => {
      // 지금 바로 그 화면(예: 그 대화방)을 보고 있으면 알림을 또 띄우지 않아요.
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (wins.some((w) => w.focused && new URL(w.url).pathname === url)) return;
      await self.registration.showNotification(d.title || "🍠 고구마마켓", {
        body: d.body || "",
        icon: "/icon",
        badge: "/icon",
        tag: d.tag, // 같은 tag(같은 대화방)는 알림 하나로 묶여요
        renotify: !!d.tag,
        data: { url },
      });
    })(),
  );
});

// 알림을 누르면: 열려 있는 고구마마켓 창이 있으면 그 창에서, 없으면 새 창으로 그 화면을 열어요.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        await win.focus();
        if ("navigate" in win) return win.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
