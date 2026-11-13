"use server";
// 좋아요(♡) 누르기 / 취소하기 Server Action
// 실제로 '내 좋아요만' 넣고 지울 수 있는지는 DB의 RLS가 한 번 더 검사해요.
// ♡ 숫자(items.like_count)는 DB 트리거가 알아서 늘리고 줄여요.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export async function toggleLike(itemId: number) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/items/${itemId}`);

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("item_likes")
    .select("item_id")
    .eq("item_id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("item_likes").delete().eq("item_id", itemId).eq("user_id", user.id);
  } else {
    // 같은 순간 두 번 눌러도 한 번만 들어가게(이미 있으면 무시)
    await supabase.from("item_likes").upsert({ item_id: itemId, user_id: user.id }, { ignoreDuplicates: true });
  }

  // 목록·상세·관심목록의 숫자를 새로 그려요.
  revalidatePath("/", "layout");
}
