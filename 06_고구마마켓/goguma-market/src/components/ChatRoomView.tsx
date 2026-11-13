"use client";
// 1:1 대화방 화면 (메시지 목록 + 입력칸)
// Supabase Realtime: DB에 새 메시지가 들어오면 서버가 바로 알려 줘서, 새로고침 없이 화면에 떠요.
// 내가 읽은 상대 메시지는 read_at을 채워서, 상대 화면에 '읽음'이 보이게 해요.
// 사진은 '비공개' 버킷(goguma-chat-photos)에 올리고, 볼 때는 잠깐만 열리는 주소(signed URL)를 받아서 보여 줘요.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/photos";
import { friendlyDbError } from "@/lib/market";
import type { ChatMessage } from "@/lib/social";

const CHAT_BUCKET = "goguma-chat-photos";

// 서버(Vercel, 미국 시간대)와 브라우저(한국)의 시간이 달라도 같은 글자가 나오게 한국 시간으로 고정해요.
const timeFmt = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
const dayFmt = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" });

type Props = {
  roomId: number;
  myId: string;
  otherName: string;
  initialMessages: ChatMessage[];
  canOffer: boolean; // 구매자이고, 판매글이 '가격 제안 받기'일 때
  blocked: boolean; // 둘 사이에 차단이 있으면 보내기를 막아요
};

export default function ChatRoomView({ roomId, myId, otherName, initialMessages, canOffer, blocked }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [offerOpen, setOfferOpen] = useState(false);
  const [offer, setOffer] = useState("");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient>>(null);

  // 메시지를 목록에 넣거나(새 것) 바꿔요(읽음 표시). 같은 메시지가 두 번 들어오지 않게 id로 확인해요.
  // 새 메시지는 '보낸 시각 → 번호' 순으로 끼워 넣어요. (실시간 도착 순서가 뒤바뀌어도 대화 순서는 그대로)
  function upsert(msg: ChatMessage) {
    setMessages((prev) => {
      const i = prev.findIndex((m) => m.id === msg.id);
      if (i !== -1) {
        const next = [...prev];
        next[i] = msg;
        return next;
      }
      return [...prev, msg].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    });
  }

  // 상대가 보낸 안 읽은 메시지를 '읽음'으로 표시
  async function markRead() {
    await supabaseRef.current
      ?.from("chat_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .neq("sender_id", myId)
      .is("read_at", null);
  }

  // 방에 들어오면: 읽음 표시 + 실시간 구독 시작, 나가면 구독 끝
  useEffect(() => {
    const supabase = createClient();
    supabaseRef.current = supabase;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let closed = false;

    (async () => {
      // 실시간 연결에도 로그인 정보를 실어야 RLS(방의 두 사람만)가 동작해요.
      const { data } = await supabase.auth.getSession();
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      if (closed) return;

      channel = supabase
        .channel(`room-${roomId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` },
          (payload) => {
            const msg = payload.new as ChatMessage;
            if (!msg?.id) return;
            upsert(msg);
            if (payload.eventType === "INSERT" && msg.sender_id !== myId) markRead();
          },
        )
        // 실시간 연결이 준비된 순간, 그 사이에 온 메시지가 있으면 채워 넣어요. (연결 전 틈에 온 메시지 놓치지 않기)
        .subscribe(async (status) => {
          if (status !== "SUBSCRIBED") return;
          const { data: latest } = await supabase
            .from("chat_messages")
            .select("*")
            .eq("room_id", roomId)
            .order("created_at", { ascending: false })
            .limit(50);
          (latest ?? []).reverse().forEach((m) => upsert(m as ChatMessage));
          markRead();
        });
      markRead();
    })();

    return () => {
      closed = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 방이 바뀔 때만 다시 연결해요
  }, [roomId, myId]);

  // 사진 메시지의 '잠깐 열리는 주소'를 한꺼번에 받아 와요 (1시간 동안 유효)
  // 주소를 못 받은 사진(차단된 사이 등)은 ""로 적어 두고 다시 묻지 않아요. (끝없이 다시 요청하던 문제 방지)
  useEffect(() => {
    if (blocked) return;
    const need = messages.map((m) => m.image_path).filter((p): p is string => !!p && !(p in imageUrls));
    if (need.length === 0) return;
    let cancelled = false;
    (async () => {
      const supabase = supabaseRef.current ?? createClient();
      const { data } = await supabase.storage.from(CHAT_BUCKET).createSignedUrls(need, 3600);
      if (cancelled || !data) return;
      setImageUrls((prev) => {
        const next = { ...prev };
        const got = new Map(data.map((d) => [d.path, d.signedUrl]));
        for (const p of need) next[p] = got.get(p) ?? "";
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, imageUrls, blocked]);

  // 새 메시지가 생기면 맨 아래로 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // 메시지 한 개 보내기 (글자 또는 사진)
  async function insert(body: string, imagePath: string | null = null) {
    const { data, error } = await supabaseRef.current!
      .from("chat_messages")
      .insert({ room_id: roomId, sender_id: myId, body, image_path: imagePath })
      .select()
      .single();
    if (error) throw new Error(friendlyDbError(error.message));
    upsert(data as ChatMessage);
  }

  async function run(task: () => Promise<void>) {
    if (sending || !supabaseRef.current) return;
    setSending(true);
    setError(undefined);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "메시지를 보내지 못했어요.");
    } finally {
      setSending(false);
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    run(async () => {
      await insert(body);
      setText("");
    });
  }

  function sendOffer(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(offer.replace(/[,\s원]/g, ""));
    if (!Number.isFinite(price) || price <= 0) {
      setError("제안할 가격을 숫자로 적어 주세요.");
      return;
    }
    run(async () => {
      await insert(`💰 가격 제안: ${price.toLocaleString("ko-KR")}원에 거래할 수 있을까요?`);
      setOffer("");
      setOfferOpen(false);
    });
  }

  function sendPhoto(file: File | undefined) {
    if (!file) return;
    run(async () => {
      let blob: Blob;
      try {
        blob = await compressImage(file);
      } catch {
        throw new Error("열 수 없는 사진 형식이에요. JPG나 PNG로 보내 주세요.");
      }
      const path = `${roomId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabaseRef.current!.storage.from(CHAT_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error("사진을 올리지 못했어요: " + error.message);
      try {
        await insert("", path);
      } catch (e) {
        // 메시지를 못 남겼으면 올린 사진도 지워요. (아무도 못 보는 사진이 저장 공간에 남지 않게)
        await supabaseRef.current!.storage.from(CHAT_BUCKET).remove([path]);
        throw e;
      }
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col">
      {/* 메시지 영역이 남은 화면 높이를 채워서, 대화가 짧아도 입력칸이 항상 화면 아래에 붙어요.
          (100dvh = 휴대폰 주소창까지 고려한 실제 화면 높이, 빼는 값 = 위쪽 머리말 + 방 정보 + 아래 메뉴·입력칸) */}
      <div className="flex min-h-[calc(100dvh-19rem)] flex-col gap-1.5 px-4 py-4 md:min-h-[calc(100dvh-15rem)]">
        {messages.length === 0 && (
          <p className="my-auto text-center text-sm text-soil-soft">{otherName}님에게 첫 인사를 건네 보세요 🌱</p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === myId;
          const day = dayFmt.format(new Date(m.created_at));
          const showDay = i === 0 || dayFmt.format(new Date(messages[i - 1].created_at)) !== day;
          const url = m.image_path ? imageUrls[m.image_path] : undefined;
          return (
            <div key={m.id}>
              {showDay && (
                <p className="my-3 text-center text-xs text-soil-soft">
                  <span className="rounded-full bg-hanji-deep px-3 py-1">{day}</span>
                </p>
              )}
              {/* 거래 약속 진행 안내(자동 메시지)는 가운데에 작게 */}
              {m.kind === "system" ? (
                <p className="my-2 text-center text-xs">
                  <span className="inline-block rounded-2xl border-2 border-dashed border-straw bg-[#fffaf0] px-3 py-1.5 leading-relaxed">
                    {m.body}
                  </span>
                </p>
              ) : (
              <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                {m.image_path ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block max-w-[70%] overflow-hidden rounded-2xl border-2 border-soil bg-hanji-deep"
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 잠깐만 열리는 주소라 <Image> 최적화를 쓸 수 없어요
                      <img src={url} alt="보낸 사진" className="max-h-72 w-auto object-contain" />
                    ) : (
                      <span className="grid h-40 w-40 animate-pulse place-items-center text-2xl">📷</span>
                    )}
                  </a>
                ) : (
                  <p
                    className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl border-2 border-soil px-3.5 py-2 leading-relaxed ${
                      mine ? "rounded-br-sm bg-skin text-white" : "rounded-bl-sm bg-[#fffaf0]"
                    } ${m.body.startsWith("💰 가격 제안") ? "ring-4 ring-flesh/50" : ""}`}
                  >
                    {m.body}
                  </p>
                )}
                <span className="shrink-0 pb-0.5 text-[10px] leading-tight text-soil-soft">
                  {/* 내가 보낸 메시지: 상대가 읽기 전엔 '읽지 않음', 읽으면 실시간으로 '읽음'으로 바뀌어요 */}
                  {mine && (
                    <span className={`block text-right ${m.read_at ? "text-soil-soft" : "font-bold text-flesh"}`}>
                      {m.read_at ? "읽음" : "읽지 않음"}
                    </span>
                  )}
                  {timeFmt.format(new Date(m.created_at))}
                </span>
              </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 입력칸: 휴대폰 아래 메뉴 위에 붙어 있어요 */}
      <div className="sticky bottom-[64px] border-t-2 border-soil bg-hanji md:bottom-0">
        {blocked ? (
          <p className="px-4 py-4 text-center text-sm text-soil-soft">🚫 차단된 사이라 메시지를 보낼 수 없어요.</p>
        ) : (
          <>
            {offerOpen && (
              <form onSubmit={sendOffer} className="flex items-center gap-2 border-b-2 border-dashed border-straw px-3 py-2">
                <span className="text-sm">💰</span>
                <input
                  value={offer}
                  onChange={(e) => setOffer(e.target.value)}
                  inputMode="numeric"
                  placeholder="제안할 가격 (원)"
                  aria-label="제안할 가격"
                  className="field flex-1 py-2!"
                />
                <button type="submit" className="btn-goguma px-3! py-2! text-sm!" disabled={sending}>제안</button>
                <button type="button" onClick={() => setOfferOpen(false)} className="text-sm text-soil-soft">취소</button>
              </form>
            )}
            <form onSubmit={send} className="flex items-end gap-2 px-3 py-3">
              {/* 사진 보내기 */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-soil/40 bg-[#fffaf0] text-lg hover:border-skin"
                aria-label="사진 보내기"
                disabled={sending}
              >
                📷
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => sendPhoto(e.target.files?.[0])} />
              {canOffer && !offerOpen && (
                <button
                  type="button"
                  onClick={() => setOfferOpen(true)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-flesh bg-flesh-soft text-lg"
                  aria-label="가격 제안하기"
                >
                  💰
                </button>
              )}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter = 보내기, Shift+Enter = 줄바꿈 (한글 조합 중에는 보내지 않아요)
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                maxLength={1000}
                placeholder="메시지 보내기"
                aria-label="메시지 입력"
                className="field max-h-32 min-h-11 flex-1 resize-none py-2.5"
              />
              <button type="submit" className="btn-goguma h-11 shrink-0 px-4! py-0! text-sm!" disabled={sending || !text.trim()}>
                {sending ? "…" : "보내기"}
              </button>
            </form>
          </>
        )}
        {error && <p className="px-4 pb-2 text-xs text-ember">{error}</p>}
      </div>
    </div>
  );
}
