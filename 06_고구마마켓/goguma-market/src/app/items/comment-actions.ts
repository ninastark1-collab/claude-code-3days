"use server";
// 판매글 댓글 쓰기 / 지우기 Server Actions
// 누가 쓰고 지울 수 있는지는 DB의 RLS가 한 번 더 검사해요.
// (쓰기: 로그인한 본인 이름으로만 / 지우기: 댓글 쓴 사람 또는 그 글의 판매자)

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/market";

// body: 실패했을 때 적던 내용을 돌려줘서 입력칸이 비지 않게 해요.
export type CommentState = { error?: string; ok?: number; body?: string } | undefined;

// bind로 글 번호를 미리 넣어서 써요.
export async function addComment(itemId: number, _prev: CommentState, formData: FormData): Promise<CommentState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/items/${itemId}`);

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "댓글 내용을 적어 주세요." };
  if (body.length > 500) return { error: "댓글은 500자까지 적을 수 있어요.", body };

  // 답글이면 원댓글 번호가 같이 와요. (답글에 답글은 DB 규칙이 막아요)
  const parentRaw = String(formData.get("parentId") ?? "");
  const parent_id = /^\d+$/.test(parentRaw) ? Number(parentRaw) : null;

  const supabase = await createClient();
  const { error } = await supabase.from("item_comments").insert({ item_id: itemId, author_id: user.id, body, parent_id });
  if (error) return { error: friendlyDbError(error.message), body };

  revalidatePath(`/items/${itemId}`);
  // ok에 시각을 넣어 두면, 폼이 '방금 성공했다'는 걸 알고 입력칸을 비워요.
  return { ok: Date.now() };
}

export async function deleteComment(commentId: number, itemId: number) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/items/${itemId}`);

  const supabase = await createClient();
  const { error } = await supabase.from("item_comments").delete().eq("id", commentId);
  if (error) throw new Error("댓글을 지우지 못했어요: " + error.message);

  revalidatePath(`/items/${itemId}`);
}
