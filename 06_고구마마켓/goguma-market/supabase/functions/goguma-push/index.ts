// 고구마마켓 푸시 알림 보내기 (Supabase Edge Function: Supabase 서버에서 도는 작은 프로그램)
// DB 트리거(019)가 새 채팅 메시지·새 알림이 생길 때 { kind, id }를 보내 줘요.
// → 받는 사람의 기기들(push_subscriptions)로 웹 푸시를 보내요.
// 비밀 값(VAPID 비밀 열쇠, 트리거 암호)은 DB 금고(Vault)에서 꺼내 와요. 코드에는 없어요.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// 공개용 열쇠 (브라우저 코드 src/lib/push.ts 와 같은 값)
const VAPID_PUBLIC = "BE7ABIT7biTJDEbA7CmTLvaGk_NLg_iM47BNeac_bGcvlc-dGo6JqFuWJ_i1HxC_8Tkox2He9Fdd3n_0BHtLNdY";
const SITE = "https://goguma-market-blond.vercel.app";

// 관리자 권한 클라이언트: 받는 사람의 구독 정보를 읽어야 해서요. (이 함수 안에서만 써요)
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

let hook: string | null = null;
async function loadConfig() {
  if (hook) return true;
  const { data, error } = await db.rpc("goguma_push_config");
  if (error || !data?.vapid_private || !data?.hook) return false;
  webpush.setVapidDetails(SITE, VAPID_PUBLIC, data.vapid_private);
  hook = data.hook;
  return true;
}

type Payload = { to: string; title: string; body: string; url: string; tag: string };

const cut = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + "…" : s);
const FRESH_MS = 5 * 60_000; // 5분이 지난 일은 보내지 않아요 (늦게 온 요청 방지)

async function chatPayload(id: number): Promise<Payload | null> {
  const { data: m } = await db
    .from("chat_messages")
    .select("id, room_id, sender_id, body, image_path, kind, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!m || Date.now() - new Date(m.created_at).getTime() > FRESH_MS) return null;
  const { data: room } = await db.from("chat_rooms").select("seller_id, buyer_id, item_id").eq("id", m.room_id).maybeSingle();
  if (!room) return null;
  const to = room.seller_id === m.sender_id ? room.buyer_id : room.seller_id;
  // 차단된 사이에는 보내지 않아요
  const { count } = await db
    .from("user_blocks")
    .select("blocker_id", { count: "exact", head: true })
    .or(`and(blocker_id.eq.${to},blocked_id.eq.${m.sender_id}),and(blocker_id.eq.${m.sender_id},blocked_id.eq.${to})`);
  if (count) return null;
  const [{ data: who }, { data: item }] = await Promise.all([
    db.from("profiles").select("nickname").eq("id", m.sender_id).maybeSingle(),
    db.from("items").select("title").eq("id", room.item_id).maybeSingle(),
  ]);
  const system = m.kind === "system";
  return {
    to,
    title: system ? `🤝 거래 약속 소식${item ? ` · ${cut(item.title, 20)}` : ""}` : `💬 ${who?.nickname ?? "이웃"}님`,
    body: cut(m.body || (m.image_path ? "📷 사진을 보냈어요" : "새 메시지")),
    url: `/chat/${m.room_id}`,
    tag: `chat-${m.room_id}`, // 같은 대화방 알림은 하나로 묶여요
  };
}

async function notiPayload(id: number): Promise<Payload | null> {
  const { data: n } = await db
    .from("notifications")
    .select("id, user_id, actor_id, type, item_id, post_id, body, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!n || Date.now() - new Date(n.created_at).getTime() > FRESH_MS) return null;
  const [{ data: actor }, { data: item }] = await Promise.all([
    n.actor_id ? db.from("profiles").select("nickname").eq("id", n.actor_id).maybeSingle() : Promise.resolve({ data: null }),
    n.item_id ? db.from("items").select("title").eq("id", n.item_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const who = actor?.nickname ?? "누군가";
  const title = item?.title ? `‘${cut(item.title, 20)}’` : "내 글";
  const itemUrl = n.item_id ? `/items/${n.item_id}` : "/notifications";
  const body = n.body ? ` — ${cut(n.body, 60)}` : "";
  const text: Record<string, [string, string]> = {
    comment: [`${who}님이 ${title}에 댓글을 남겼어요${body}`, itemUrl],
    like: [`${who}님이 ${title}을(를) 관심목록에 담았어요 ♡`, itemUrl],
    review: [`${who}님이 거래 후기를 보냈어요 💌${body}`, "/users/me"],
    sold: [`${who}님과 ${title} 거래가 완료됐어요. 후기를 남겨 주세요!`, itemUrl],
    keyword: [`키워드 ‘${n.body}’ 새 물건이 올라왔어요 🏷️ ${title}`, itemUrl],
    report: [`내가 한 신고가 처리됐어요${body}`, "/my"],
    reply: [`${who}님이 내 댓글에 답글을 남겼어요${body}`, n.item_id ? itemUrl : `/community/${n.post_id}`],
    price_drop: [`관심 상품 ${title}의 가격이 내려갔어요 📉${body}`, itemUrl],
    post_comment: [`${who}님이 내 동네생활 글에 댓글을 남겼어요${body}`, `/community/${n.post_id}`],
  };
  const [msg, url] = text[n.type] ?? ["새 알림이 있어요", "/notifications"];
  return { to: n.user_id, title: "🍠 고구마마켓", body: msg, url, tag: `noti-${n.id}` };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (!(await loadConfig())) return new Response("config", { status: 500 });
  // DB 트리거만 부를 수 있게: 금고에 있는 암호가 맞는지 확인
  if (req.headers.get("x-goguma-hook") !== hook) return new Response("unauthorized", { status: 401 });

  const { kind, id } = await req.json().catch(() => ({}));
  if (!["chat", "noti"].includes(kind) || !Number.isInteger(id)) return new Response("bad", { status: 400 });

  // 같은 일을 두 번 보내지 않게 기록 (이미 있으면 건너뛰어요)
  const { error: dup } = await db.from("push_sent").insert({ kind, ref_id: id });
  if (dup) return new Response("dup");

  const p = kind === "chat" ? await chatPayload(id) : await notiPayload(id);
  if (!p) return new Response("skip");

  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", p.to);
  const message = JSON.stringify({ title: p.title, body: p.body, url: p.url, tag: p.tag });
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 3600 });
        sent++;
      } catch (e) {
        // 404·410: 그 기기가 알림을 끄거나 앱을 지웠어요 → 구독 정리
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      }
    }),
  );
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
