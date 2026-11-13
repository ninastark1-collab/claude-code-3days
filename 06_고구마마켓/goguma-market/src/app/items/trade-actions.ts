"use server";
// 거래 관련 Server Actions: 거래완료(구매자 고르기), 끌어올리기, 거래 후기
// 구매자는 '이 글로 채팅한 사람'만 고를 수 있고, 후기는 판매자↔구매자끼리만 — DB 규칙(RLS)이 검사해요.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { friendlyDbError, RATINGS, type Rating } from "@/lib/market";
import { safePath } from "@/lib/safe-path";

// 거래완료로 바꾸면서 구매자를 정해요. back: 끝나고 돌아갈 주소
export async function markSold(itemId: number, buyerId: string, back: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/items/${itemId}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({ status: "거래완료", buyer_id: buyerId })
    .eq("id", itemId)
    .eq("seller_id", user.id)
    .select("id");
  if (error) throw new Error(friendlyDbError(error.message));
  if (!data?.length) throw new Error("내 글만 거래완료로 바꿀 수 있어요.");

  revalidatePath("/", "layout");
  // 돌아갈 주소는 우리 사이트 경로만 ('//다른사이트'나 '/\다른사이트'는 막아요)
  redirect(`${safePath(back, `/items/${itemId}`)}?toast=sold`);
}

export type BumpState = { error?: string } | undefined;

// 끌어올리기: 목록 맨 위로 (하루 한 번, DB 트리거가 검사)
export async function bumpItem(itemId: number, _prev: BumpState): Promise<BumpState> {
  void _prev; // useActionState가 이전 상태를 넘겨주지만 여기선 쓰지 않아요
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/items/${itemId}`);

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ bumped_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("seller_id", user.id);
  if (error) return { error: friendlyDbError(error.message) };

  revalidatePath("/", "layout");
  redirect(`/items/${itemId}?toast=bumped`);
}

export type ReviewState = { error?: string } | undefined;

// 거래 후기 남기기 → 상대의 고구마 온도가 바뀌어요.
export async function submitReview(
  itemId: number,
  revieweeId: string,
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/items/${itemId}`);

  const rating = String(formData.get("rating") ?? "") as Rating;
  const body = String(formData.get("body") ?? "").trim();
  if (!(rating in RATINGS)) return { error: "거래가 어땠는지 하나 골라 주세요." };
  if (body.length > 300) return { error: "후기는 300자까지 적을 수 있어요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_reviews")
    .insert({ item_id: itemId, reviewer_id: user.id, reviewee_id: revieweeId, rating, body });
  if (error) {
    if (error.code === "23505") return { error: "이 거래엔 이미 후기를 남겼어요." };
    return { error: friendlyDbError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect(`/items/${itemId}?toast=reviewed`);
}
