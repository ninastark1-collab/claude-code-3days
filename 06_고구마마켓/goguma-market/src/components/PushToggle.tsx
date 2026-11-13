"use client";
// 푸시 알림 켜기/끄기: 사이트를 닫아 둬도 새 채팅·알림이 휴대폰·컴퓨터 알림으로 와요.
// 켜기 = ① 서비스 워커 등록 ② 알림 권한 묻기 ③ 브라우저에서 '받을 주소(구독)'를 받아 ④ DB에 저장
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { currentSubscription, keyToBytes, VAPID_PUBLIC_KEY } from "@/lib/push";

type Status = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

export default function PushToggle({ userId }: { userId: string }) {
  // 처음엔 서버와 같은 화면(확인 중)에서 시작해요. (hydration 오류 방지)
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let next: Status;
      if (!supported) {
        // 아이폰은 '홈 화면에 추가'한 앱에서만 푸시를 받을 수 있어요.
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        next = ios ? "ios-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "denied";
      } else {
        const sub = await currentSubscription();
        let mine = false;
        if (sub) {
          const { data } = await createClient().from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).maybeSingle();
          mine = !!data;
        }
        next = mine ? "on" : "off";
      }
      if (!cancelled) setStatus(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function turnOn() {
    setBusy(true);
    setError(undefined);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) }));
      const json = sub.toJSON();
      const { error } = await createClient().from("push_subscriptions").insert({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      // 23505 = 이미 저장된 기기 → 괜찮아요
      if (error && error.code !== "23505") throw new Error(error.message);
      setStatus("on");
    } catch (e) {
      setError("알림을 켜지 못했어요. " + (e instanceof Error ? e.message : ""));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(undefined);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await createClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  const text: Record<Status, string> = {
    checking: "확인 중…",
    unsupported: "이 브라우저는 푸시 알림을 지원하지 않아요.",
    "ios-install": "아이폰은 Safari 공유 버튼 → ‘홈 화면에 추가’로 설치한 뒤, 거기서 켤 수 있어요.",
    denied: "알림이 차단돼 있어요. 브라우저 주소창 왼쪽 자물쇠 → 알림 → ‘허용’으로 바꾼 뒤 다시 눌러 주세요.",
    off: "사이트를 닫아 둬도 새 채팅·댓글·거래 소식을 알려 드려요.",
    on: "이 기기로 푸시 알림을 받고 있어요. 🟢",
  };

  return (
    <div className="stitch flex flex-col gap-2 bg-[#fffaf0]/70 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <span className="text-xl" aria-hidden>📲</span>
          <span className="font-display">푸시 알림</span>
        </span>
        {status === "on" ? (
          <button type="button" onClick={turnOff} disabled={busy} className="btn-straw px-3! py-1! text-xs">
            {busy ? "…" : "끄기"}
          </button>
        ) : status === "off" || status === "denied" ? (
          <button type="button" onClick={turnOn} disabled={busy} className="btn-goguma px-3! py-1! text-xs!">
            {busy ? "켜는 중…" : "켜기"}
          </button>
        ) : null}
      </div>
      <p className="text-xs text-soil-soft" aria-live="polite">{text[status]}</p>
      {error && <p className="text-xs text-ember">{error}</p>}
    </div>
  );
}
