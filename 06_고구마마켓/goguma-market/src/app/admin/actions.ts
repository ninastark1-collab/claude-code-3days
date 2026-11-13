"use server";
// 운영자 전용 Server Actions: 신고 처리, 판매글 숨기기/다시 보이기, 문제 댓글·글 지우기
// 운영자인지는 여기서 한 번, DB 규칙(RLS — goguma_admins 표)에서 한 번 더 확인해요.

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { safePath } from "@/lib/safe-path";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/reports");
  if (!user.isAdmin) notFound();
  return user;
}

// 신고 처리: status = 처리완료 / 반려, 메모는 신고한 사람에게 알림으로 가요.
export async function handleReport(reportId: number, status: "처리완료" | "반려", formData: FormData) {
  const admin = await requireAdmin();
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .update({ status, admin_note: note, handled_at: new Date().toISOString(), handled_by: admin.id })
    .eq("id", reportId);
  if (error) throw new Error("신고를 처리하지 못했어요: " + error.message);
  revalidatePath("/admin/reports");
  redirect("/admin/reports?toast=handled");
}

// 판매글 숨기기 / 다시 보이기 (숨긴 글은 판매자·운영자만 볼 수 있어요)
export async function setItemHidden(itemId: number, hidden: boolean, back: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("items").update({ is_hidden: hidden }).eq("id", itemId);
  if (error) throw new Error("바꾸지 못했어요: " + error.message);
  revalidatePath("/", "layout");
  const to = safePath(back, "/admin/reports"); // 우리 사이트 경로만
  redirect(`${to}${to.includes("?") ? "&" : "?"}toast=${hidden ? "hidden" : "shown"}`);
}

// 문제 댓글(판매글 댓글 또는 동네생활 댓글) / 동네생활 글 지우기
export async function adminDelete(kind: "item_comment" | "post_comment" | "post", id: number) {
  await requireAdmin();
  const table = kind === "item_comment" ? "item_comments" : kind === "post_comment" ? "community_comments" : "community_posts";
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error("지우지 못했어요: " + error.message);
  revalidatePath("/", "layout");
  redirect("/admin/reports?toast=deleted");
}
