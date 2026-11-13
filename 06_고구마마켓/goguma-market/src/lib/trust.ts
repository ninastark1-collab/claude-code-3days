// 프로필·후기·알림·차단 데이터를 DB에서 읽어 오는 함수들 (서버 전용)
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Rating } from "@/lib/market";

export type Profile = {
  id: string;
  nickname: string;
  region: string | null;
  avatar: string;
  manner_temp: number;
  region_verified_at: string | null;
  last_seen_at: string | null; // 마지막 접속 (접속 상태를 숨긴 사람은 비어 있어요)
  created_at: string;
};

// 다른 사람(판매자) 프로필. 프로필은 누구나 볼 수 있어요.
export async function getProfile(userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) return null;
  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, nickname, region, avatar, manner_temp, region_verified_at, last_seen_at, created_at")
    .eq("id", userId)
    .maybeSingle();
  return data ? ({ ...data, manner_temp: Number(data.manner_temp) } as Profile) : null;
}

export type Review = {
  id: number;
  item_id: number | null; // 글이 지워지면 비어요
  item_title: string | null; // 후기를 남길 때 적어 둔 물건 제목
  reviewer_id: string;
  reviewee_id: string;
  rating: Rating;
  body: string;
  created_at: string;
  reviewer: { nickname: string; avatar: string } | null;
  item: { id: number; title: string; seller_id: string } | null;
};

// 이 사람이 받은 거래 후기 (최근 순)
export async function getReviewsFor(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_reviews")
    .select("*, reviewer:profiles!item_reviews_reviewer_id_fkey(nickname, avatar), item:items(id, title, seller_id)")
    .eq("reviewee_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("후기를 불러오지 못했어요: " + error.message);
  return (data ?? []) as Review[];
}

// 이 글에 내가 이미 후기를 남겼는지
// revieweeId: 같은 물건을 다른 사람에게 다시 팔았을 때, "이번 구매자"에게 남겼는지를 따로 봐요.
export async function hasReviewed(itemId: number, userId: string | undefined, revieweeId?: string | null) {
  if (!userId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("item_reviews")
    .select("id")
    .eq("item_id", itemId)
    .eq("reviewer_id", userId)
    .eq("reviewee_id", revieweeId ?? "")
    .maybeSingle();
  return !!data;
}

export type Notification = {
  id: number;
  type: "comment" | "like" | "review" | "sold" | "post_comment" | "keyword" | "report" | "reply" | "price_drop";
  body: string;
  read_at: string | null;
  created_at: string;
  item_id: number | null;
  post_id: number | null;
  actor: { nickname: string; avatar: string } | null;
  item: { id: number; title: string } | null;
};

// 내 알림 (최근 50개)
export async function getMyNotifications(userId: string) {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*, actor:profiles!notifications_actor_id_fkey(nickname, avatar), item:items(id, title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("알림을 불러오지 못했어요: " + error.message);
  return (data ?? []) as Notification[];
}

// 내가 이 사람을 차단했는지
export async function isBlockedByMe(myId: string | undefined, otherId: string) {
  if (!myId || myId === otherId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", myId)
    .eq("blocked_id", otherId)
    .maybeSingle();
  return !!data;
}

// 둘 사이에 차단이 있는지 (내가 했든, 상대가 나를 했든). 채팅방에서 보내기·약속을 막는 데 써요.
// (017부터 '나를 차단한 기록'도 나에게는 보여요)
export async function isBlockedBetween(myId: string | undefined, otherId: string) {
  if (!myId || myId === otherId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_blocks")
    .select("blocker_id")
    .or(`and(blocker_id.eq.${myId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${myId})`)
    .limit(1);
  return (data ?? []).length > 0;
}

// 내 차단 목록
export async function getMyBlocks(myId: string) {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_blocks")
    .select("created_at, blocked:profiles!user_blocks_blocked_id_fkey(id, nickname, avatar)")
    .eq("blocker_id", myId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => r.blocked as unknown as { id: string; nickname: string; avatar: string }).filter(Boolean);
}

// 이 글로 나와 채팅한 사람들 (거래완료 때 구매자 고르기용)
export async function getChatPartnersForItem(itemId: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_rooms")
    .select("id, buyer_id, last_message_at, buyer:profiles!chat_rooms_buyer_id_fkey(nickname, avatar)")
    .eq("item_id", itemId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  return (data ?? []) as unknown as { id: number; buyer_id: string; buyer: { nickname: string; avatar: string } | null }[];
}
