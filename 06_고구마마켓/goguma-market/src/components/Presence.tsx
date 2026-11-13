"use client";
// 접속 중인 사용자 (Supabase Realtime Presence)
// 연결은 머리말의 <PresenceIdentity>가 맺어요. (로그인한 사람이 바뀌면 다시 맺어요)
// Presence: 같은 '방(channel)'에 들어와 있는 사람 목록을 실시간으로 알려 주는 기능이에요.
// - 로그인했고 '접속 상태 공개'를 켠 사람만 자기 id를 알려요(track).
// - 누구나 목록을 들을 수 있어서, 로그인 안 한 사람도 "n명 접속 중"을 볼 수 있어요.
// - 2분마다 '마지막 접속 시각'도 DB에 남겨요. (나갔을 때 'n분 전 접속' 표시용)

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";

const listeners = new Set<(ids: Set<string>) => void>();
let online = new Set<string>();
// 지금 연결된 '나'(로그인한 사람 id + 공개 여부). 로그인·로그아웃은 새로고침 없이 일어나서,
// 머리말이 알려 줄 때마다 바뀌었으면 연결을 끊고 새로 맺어요.
let identity: string | null = null;
let stop: (() => Promise<unknown>) | null = null;
// 연결 바꾸기는 한 줄로 차례차례: 예전 연결이 '완전히' 끊긴 뒤에 새로 맺어요.
// (같은 이름의 연결이 남아 있으면 라이브러리가 예전 것을 돌려줘서 오류가 났어요)
let queue: Promise<void> = Promise.resolve();

function connect(me: string | undefined, share: boolean) {
  const key = `${me ?? "guest"}:${share}`;
  if (identity === key) return;
  identity = key;
  queue = queue.then(async () => {
    if (stop) await stop().catch(() => {}); // 예전 연결(다른 사람으로 접속 중이던 것)부터 정리
    stop = null;
    if (identity !== key) return; // 그사이 또 바뀌었으면 이번 연결은 건너뛰어요

    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session) supabase.realtime.setAuth(data.session.access_token);

    let timer: ReturnType<typeof setInterval> | undefined;
    const channel = supabase.channel("goguma-online", { config: { presence: { key: me ?? `guest-${crypto.randomUUID()}` } } });
    stop = () => {
      if (timer) clearInterval(timer);
      return supabase.removeChannel(channel); // 연결을 끊으면 접속 목록에서도 빠져요
    };
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ id?: string }>();
        // 사용자 id를 알린 사람만 세요. (손님은 숫자에서 빼요)
        const ids = new Set<string>();
        for (const metas of Object.values(state)) for (const m of metas) if (m.id) ids.add(m.id);
        online = ids;
        listeners.forEach((l) => l(online));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && me && share) await channel.track({ id: me });
      });

    // 마지막 접속 시각 남기기: 지금 한 번, 그다음 2분마다
    if (me && share) {
      // 주의: Supabase 질의는 then()이나 await를 해야 실제로 서버에 보내져요.
      const beat = () => {
        void supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", me).then(() => {});
      };
      beat();
      timer = setInterval(beat, 120_000);
    }
  });
}

// 머리말(로그인 정보를 아는 곳)에 놓아서, '지금 누구로 접속 중인지'를 알려 줘요.
export function PresenceIdentity({ userId, share }: { userId?: string; share: boolean }) {
  useEffect(() => {
    connect(userId, share);
  }, [userId, share]);
  return null;
}

export function useOnline() {
  // 처음엔 서버가 그린 화면과 같게 '아무도 없음'에서 시작해요. (hydration 오류 방지)
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    listeners.add(setIds);
    const t = setTimeout(() => setIds(online), 0);
    return () => {
      clearTimeout(t);
      listeners.delete(setIds);
    };
  }, []);
  return ids;
}

// 머리말의 "🟢 n명 접속 중"
export function OnlineCount() {
  const ids = useOnline();
  return (
    // 휴대폰에선 "🟢 3"처럼 짧게, 넓은 화면에선 "3명 접속 중"
    <Link
      href="/online"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border-2 border-soil/20 px-2 py-0.5 text-xs text-soil-soft hover:border-leaf"
      title="지금 접속 중인 이웃"
      aria-label={`지금 ${ids.size}명 접속 중`}
    >
      <span className="h-2 w-2 rounded-full bg-[#3fbf5f]" aria-hidden />
      {ids.size}
      <span className="hidden sm:inline">명 접속 중</span>
    </Link>
  );
}

// 사람 옆 초록 점 / '마지막 접속' (lastSeen: 서버에서 받은 마지막 접속 시각)
export function OnlineStatus({ userId, lastSeenText }: { userId: string; lastSeenText?: string | null }) {
  const ids = useOnline();
  if (ids.has(userId))
    return (
      <span className="inline-flex items-center gap-1 text-xs text-leaf">
        <span className="h-2 w-2 rounded-full bg-[#3fbf5f]" aria-hidden />
        접속 중
      </span>
    );
  return lastSeenText ? <span className="text-xs text-soil-soft">{lastSeenText} 접속</span> : null;
}

// /online 화면의 목록: 접속 중인 사람들의 프로필을 불러와 보여 줘요.
export function OnlineList() {
  const ids = useOnline();
  const [people, setPeople] = useState<{ id: string; nickname: string; avatar: string; region: string | null }[]>([]);
  const key = [...ids].sort().join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    createClient()
      .from("profiles")
      .select("id, nickname, avatar, region")
      .in("id", key.split(","))
      .then(({ data }) => {
        if (!cancelled) setPeople(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const shown = key ? people.filter((p) => ids.has(p.id)) : [];
  if (shown.length === 0)
    return <p className="stitch mt-6 px-4 py-10 text-center text-sm text-soil-soft">지금 접속 중인 이웃을 찾고 있어요… 🌱</p>;
  return (
    <ul className="stitch mt-6 divide-y-2 divide-dashed divide-straw bg-[#fffaf0]/70">
      {shown.map((p) => (
        <li key={p.id}>
          <Link href={`/users/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-flesh-soft/40">
            <span className="relative">
              <Avatar emoji={p.avatar} size={40} />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-hanji bg-[#3fbf5f]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display">{p.nickname}</span>
              <span className="block text-xs text-soil-soft">📍 {p.region ?? "동네 미설정"}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
