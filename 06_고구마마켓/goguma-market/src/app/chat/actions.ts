"use server";
// '채팅하기' 버튼 Server Action
// 이 글로 나와 판매자 사이에 이미 방이 있으면 그 방으로, 없으면 새로 만들어서 들어가요.
// (메시지 보내기는 대화방 화면에서 브라우저가 직접 DB에 넣어요. RLS가 '방의 두 사람만' 검사해요)

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export async function startChat(itemId: number) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/items/${itemId}`);

  const supabase = await createClient();
  const { data: item } = await supabase.from("items").select("id, seller_id").eq("id", itemId).maybeSingle();
  if (!item) redirect("/");
  // 내 글이면 구매자 채팅방을 만들 수 없으니, 내 채팅 목록으로 보내요.
  if (item.seller_id === user.id) redirect("/chat");

  const findRoom = () =>
    supabase.from("chat_rooms").select("id").eq("item_id", itemId).eq("buyer_id", user.id).maybeSingle();

  let { data: room } = await findRoom();
  if (!room) {
    const { data: created, error } = await supabase
      .from("chat_rooms")
      .insert({ item_id: itemId, seller_id: item.seller_id, buyer_id: user.id })
      .select("id")
      .single();
    // 42501 = 권한 없음(RLS): 판매자가 나를 차단했을 때 → 오류 화면 대신 안내만 보여 줘요.
    if (error?.code === "42501") redirect(`/items/${itemId}?toast=chat_blocked`);
    // 23505 = 이미 있는 방(같은 순간 두 번 누름) → 있는 방을 다시 찾아요.
    if (error && error.code !== "23505") throw new Error("채팅방을 만들지 못했어요: " + error.message);
    room = created ?? (await findRoom()).data;
  }
  if (!room) throw new Error("채팅방을 찾지 못했어요.");

  revalidatePath("/", "layout");
  redirect(`/chat/${room.id}`);
}

// 채팅방 나가기: 내 쪽 '나간 시각'만 기록해요. (상대가 새 메시지를 보내면 목록에 다시 나타나요)
export async function leaveChatRoom(roomId: number) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/chat");

  const supabase = await createClient();
  const { data: room } = await supabase.from("chat_rooms").select("seller_id, buyer_id").eq("id", roomId).maybeSingle();
  if (!room) redirect("/chat");
  const column = room.seller_id === user.id ? "seller_left_at" : "buyer_left_at";
  const now = new Date().toISOString();
  await supabase.from("chat_rooms").update({ [column]: now }).eq("id", roomId);
  // 나간 방의 안 읽은 메시지는 읽음으로 정리해요. (안 그러면 채팅 배지 숫자만 계속 남아요)
  await supabase.from("chat_messages").update({ read_at: now }).eq("room_id", roomId).neq("sender_id", user.id).is("read_at", null);

  revalidatePath("/chat");
  redirect("/chat?toast=left");
}
