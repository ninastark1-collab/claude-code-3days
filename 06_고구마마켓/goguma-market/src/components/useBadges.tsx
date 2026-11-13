"use client";
// 메뉴에 붙일 빨간 숫자: 안 읽은 채팅 메시지 수 + 안 읽은 알림 수
// 화면을 옮길 때마다 다시 세고, 새 메시지·알림이 오면(Realtime) 바로 다시 세요.
// 숫자는 RLS 덕분에 '내 것'만 세어져요.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 같은 화면에 배지가 여러 개(위·아래 메뉴) 있어도 연결은 하나만 쓰게, 모듈 안에서 공유해요.
type Counts = { chat: number; noti: number };
const listeners = new Set<(c: Counts) => void>();
let current: Counts = { chat: 0, noti: 0 };
let started = false;
let refresh: () => void = () => {};

function start() {
  if (started) return;
  started = true;
  const supabase = createClient();
  let myId: string | null = null;

  refresh = async () => {
    const { data } = await supabase.auth.getSession();
    myId = data.session?.user.id ?? null;
    if (!myId) {
      current = { chat: 0, noti: 0 };
    } else {
      const [chat, noti] = await Promise.all([
        supabase.from("chat_messages").select("id", { count: "exact", head: true }).is("read_at", null).neq("sender_id", myId),
        supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
      ]);
      current = { chat: chat.count ?? 0, noti: noti.count ?? 0 };
    }
    listeners.forEach((l) => l(current));
  };

  (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) supabase.realtime.setAuth(data.session.access_token);
    supabase
      .channel("badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => refresh())
      .subscribe();
    refresh();
  })();
}

// path: 지금 화면 주소. 바뀔 때마다 다시 세요. (usePathname은 부르는 쪽에서 넘겨줘요 —
//       아래 메뉴의 '미리 그려 두는 모양'에서는 주소를 알 수 없어서 빈 값이 와요)
export function useBadges(path = "") {
  const pathname = path;
  // 처음엔 서버가 그린 화면과 똑같이 0에서 시작해요. (다르면 React가 화면 전체를 다시 그려야 해요)
  const [counts, setCounts] = useState<Counts>({ chat: 0, noti: 0 });

  useEffect(() => {
    start();
    listeners.add(setCounts);
    // 이미 세어 둔 숫자가 있으면 바로 다음 순간에 보여 줘요.
    const t = setTimeout(() => setCounts(current), 0);
    return () => {
      clearTimeout(t);
      listeners.delete(setCounts);
    };
  }, []);

  // 화면을 옮기면(예: 채팅방에서 나오면) 다시 세요.
  useEffect(() => {
    if (started) refresh();
  }, [pathname]);

  return counts;
}

// 빨간 동그라미 숫자
export function Badge({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={`grid h-[18px] min-w-[18px] place-items-center rounded-full border border-hanji bg-ember px-1 text-[10px] font-bold leading-none text-white ${className}`}
      aria-label={`안 읽은 것 ${n}개`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
