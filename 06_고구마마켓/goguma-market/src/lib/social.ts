// 좋아요·채팅 데이터를 DB에서 읽어 오는 함수들 (서버 전용)
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Item } from "@/lib/market";

// 내가 이 글에 좋아요를 눌렀는지
export async function hasLiked(itemId: number, userId: string | undefined) {
  if (!userId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("item_likes")
    .select("item_id")
    .eq("item_id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

// 관심목록: 내가 좋아요 누른 글 (최근에 누른 순)
export async function getLikedItems(userId: string) {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_likes")
    .select("created_at, item:items(*, seller:profiles!items_seller_id_fkey(nickname, avatar, manner_temp))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("관심목록을 불러오지 못했어요: " + error.message);
  return (data ?? []).map((row) => row.item as unknown as Item).filter(Boolean);
}

// ── 채팅 ──────────────────────────────────────────

export type ChatMessage = {
  id: number;
  room_id: number;
  sender_id: string;
  body: string;
  image_path: string | null; // 채팅 사진 (비공개 버킷 안의 경로)
  kind: "text" | "system"; // system: 거래 약속 진행 안내 (자동)
  read_at: string | null;
  created_at: string;
};

export type ChatRoom = {
  id: number;
  item_id: number;
  seller_id: string;
  buyer_id: string;
  last_message: string | null;
  last_message_at: string | null;
  seller_left_at: string | null;
  buyer_left_at: string | null;
  created_at: string;
  item: Pick<Item, "id" | "title" | "price" | "status" | "category" | "photos" | "accept_offers" | "buyer_id"> | null;
  seller: { nickname: string; avatar: string; manner_temp: number; last_seen_at: string | null } | null;
  buyer: { nickname: string; avatar: string; manner_temp: number; last_seen_at: string | null } | null;
};

// 채팅방 + 판매글 요약 + 두 사람 닉네임
// (profiles를 두 번 가리켜서, 어느 연결인지 이름(…_fkey)으로 짚어 줘요)
const ROOM_COLUMNS =
  "*, item:items!chat_rooms_item_id_fkey(id, title, price, status, category, photos, accept_offers, buyer_id), seller:profiles!chat_rooms_seller_id_fkey(nickname, avatar, manner_temp, last_seen_at), buyer:profiles!chat_rooms_buyer_id_fkey(nickname, avatar, manner_temp, last_seen_at)";

// 내 채팅 목록 (최근 대화 순) + 방마다 안 읽은 메시지 수
export async function getMyChatRooms(userId: string) {
  await connection();
  const supabase = await createClient();
  const [rooms, unread, blocks] = await Promise.all([
    supabase
      .from("chat_rooms")
      .select(ROOM_COLUMNS)
      .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    // RLS 덕분에 내가 들어 있는 방의 메시지만 보여요.
    supabase.from("chat_messages").select("room_id").is("read_at", null).neq("sender_id", userId),
    supabase.from("user_blocks").select("blocked_id").eq("blocker_id", userId),
  ]);
  if (rooms.error) throw new Error("채팅 목록을 불러오지 못했어요: " + rooms.error.message);

  const unreadByRoom = new Map<number, number>();
  for (const m of unread.data ?? []) unreadByRoom.set(m.room_id, (unreadByRoom.get(m.room_id) ?? 0) + 1);

  const blocked = new Set((blocks.data ?? []).map((b) => b.blocked_id as string));

  return ((rooms.data ?? []) as ChatRoom[])
    .filter((room) => {
      const iAmSeller = room.seller_id === userId;
      // 내가 차단한 사람과의 방은 목록에서 숨겨요.
      if (blocked.has(iAmSeller ? room.buyer_id : room.seller_id)) return false;
      // 내가 나간 방은 숨기되, 나간 뒤에 새 메시지가 오면 다시 보여요.
      const leftAt = iAmSeller ? room.seller_left_at : room.buyer_left_at;
      return !leftAt || (!!room.last_message_at && room.last_message_at > leftAt);
    })
    .map((room) => ({ ...room, unread: unreadByRoom.get(room.id) ?? 0 }));
}

// 채팅방 하나 + 최근 메시지 (방의 두 사람이 아니면 null)
export async function getChatRoom(roomId: string) {
  if (!/^\d+$/.test(roomId)) return null;
  await connection();
  const supabase = await createClient();
  const { data: room } = await supabase.from("chat_rooms").select(ROOM_COLUMNS).eq("id", Number(roomId)).maybeSingle();
  if (!room) return null;

  // 최근 200개만 (오래된 것부터 보여 주려고 뒤집어요)
  const { data: messages } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("room_id", room.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return { room: room as ChatRoom, messages: ((messages ?? []) as ChatMessage[]).reverse() };
}

// ── 댓글 ──────────────────────────────────────────

export type ItemComment = {
  id: number;
  item_id: number;
  parent_id: number | null; // 답글이면 원댓글 번호
  is_deleted: boolean; // 답글이 달린 채 지워진 원댓글 (자리만 남아요)
  author_id: string;
  body: string;
  created_at: string;
  author: { nickname: string; avatar: string } | null;
};

// 판매글의 댓글 (오래된 것부터). 댓글은 누구나 볼 수 있어요.
export async function getComments(itemId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_comments")
    // profiles와의 연결이 여러 개라 '댓글 쓴 사람' 연결을 콕 집어 줘요.
    .select("*, author:profiles!item_comments_author_id_fkey(nickname, avatar)")
    .eq("item_id", itemId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error("댓글을 불러오지 못했어요: " + error.message);
  return (data ?? []) as ItemComment[];
}
