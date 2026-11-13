"use server";
// 동네생활 게시판 Server Actions: 글 쓰기·지우기, 댓글 쓰기·지우기
// 누가 쓰고 지울 수 있는지는 DB의 RLS가 한 번 더 검사해요.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { TOPICS } from "@/lib/topics";
import { friendlyDbError } from "@/lib/market";

export type PostState = { error?: string; fields?: Record<string, string>; ok?: number; body?: string } | undefined;

export async function createPost(_prev: PostState, formData: FormData): Promise<PostState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/community/write");

  const topic = String(formData.get("topic") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const fields = { topic, body };
  if (!TOPICS.some((t) => t.value === topic)) return { error: "주제를 골라 주세요.", fields };
  if (body.length < 2) return { error: "내용을 2자 이상 적어 주세요.", fields };
  if (body.length > 2000) return { error: "내용은 2000자까지 적을 수 있어요.", fields };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("community_posts")
    .insert({ author_id: user.id, region: user.region, topic, body })
    .select("id")
    .single();
  if (error) return { error: friendlyDbError(error.message), fields };

  revalidatePath("/community");
  redirect(`/community/${data.id}?toast=posted`);
}

export async function deletePost(postId: number) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/community");
  const supabase = await createClient();
  await supabase.from("community_posts").delete().eq("id", postId).eq("author_id", user.id);
  revalidatePath("/community");
  redirect("/community?toast=deleted");
}

export async function addPostComment(postId: number, _prev: PostState, formData: FormData): Promise<PostState> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/community/${postId}`);

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "댓글 내용을 적어 주세요." };
  if (body.length > 500) return { error: "댓글은 500자까지 적을 수 있어요.", body };

  // 답글이면 원댓글 번호가 같이 와요.
  const parentRaw = String(formData.get("parentId") ?? "");
  const parent_id = /^\d+$/.test(parentRaw) ? Number(parentRaw) : null;

  const supabase = await createClient();
  const { error } = await supabase.from("community_comments").insert({ post_id: postId, author_id: user.id, body, parent_id });
  if (error) return { error: friendlyDbError(error.message), body };

  revalidatePath(`/community/${postId}`);
  return { ok: Date.now() };
}

export async function deletePostComment(commentId: number, postId: number) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/community/${postId}`);
  const supabase = await createClient();
  await supabase.from("community_comments").delete().eq("id", commentId);
  revalidatePath(`/community/${postId}`);
}
