"use server";
// 신고·차단 Server Actions
// 신고는 기록만 남아요(관리 화면은 아직 없어서 Supabase 대시보드의 reports 표에서 확인).
// 차단하면 서로 채팅을 시작·전송할 수 없고(DB 규칙), 내 목록에서 그 사람의 글·댓글이 안 보여요.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { friendlyDbError, REPORT_REASONS } from "@/lib/market";
import { safePath } from "@/lib/safe-path";

export type ReportState = { error?: string } | undefined;

const TYPES = ["item", "user", "comment", "chat", "post"] as const;

// 다녀올 주소는 우리 사이트 안의 경로만 허락해요.
function safeBack(value: FormDataEntryValue | null) {
  const v = typeof value === "string" ? value : "";
  return safePath(v, "/");
}

export async function submitReport(_prev: ReportState, formData: FormData): Promise<ReportState> {
  const back = safeBack(formData.get("back"));
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);

  const targetType = String(formData.get("targetType") ?? "");
  const targetId = String(formData.get("targetId") ?? "").slice(0, 64);
  const reason = String(formData.get("reason") ?? "");
  const detail = String(formData.get("detail") ?? "").trim().slice(0, 500);
  if (!TYPES.includes(targetType as (typeof TYPES)[number]) || !targetId) return { error: "신고할 대상을 찾지 못했어요." };
  if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) return { error: "신고 사유를 골라 주세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reports")
    .insert({ reporter_id: user.id, target_type: targetType, target_id: targetId, reason, detail });
  if (error) return { error: friendlyDbError(error.message) };

  redirect(`${back}${back.includes("?") ? "&" : "?"}toast=reported`);
}

export async function blockUser(otherId: string, back: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (otherId === user.id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("user_blocks").upsert({ blocker_id: user.id, blocked_id: otherId }, { ignoreDuplicates: true });
  if (error) throw new Error(friendlyDbError(error.message));

  revalidatePath("/", "layout");
  const to = safePath(back, "/");
  redirect(`${to}${to.includes("?") ? "&" : "?"}toast=blocked`);
}

export async function unblockUser(otherId: string, back: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", otherId);

  revalidatePath("/", "layout");
  const to = safePath(back, "/");
  redirect(`${to}${to.includes("?") ? "&" : "?"}toast=unblocked`);
}
