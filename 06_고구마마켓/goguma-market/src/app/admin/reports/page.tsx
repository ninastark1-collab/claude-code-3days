import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RowListSkeleton } from "@/components/Skeletons";
import { adminDelete, handleReport, setItemHidden } from "@/app/admin/actions";
import { getCurrentUser } from "@/lib/auth";
import { getRequestTime } from "@/lib/items";
import { timeAgo } from "@/lib/market";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "신고 처리 · 운영자 · 고구마마켓" };

const STATUSES = ["접수", "처리완료", "반려"] as const;
const TYPE_LABEL: Record<string, string> = { item: "판매글", user: "사용자", comment: "댓글", chat: "채팅", post: "동네생활 글" };

type Report = {
  id: number;
  target_type: string;
  target_id: string;
  reason: string;
  detail: string;
  status: (typeof STATUSES)[number];
  admin_note: string;
  created_at: string;
  handled_at: string | null;
  reporter: { nickname: string } | null;
};

// 운영자 전용: 신고 목록을 보고 처리해요. 운영자가 아니면 '없는 페이지'로 보여요.
export default function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl">신고 처리 🛡️</h1>
      <p className="mt-1 text-sm text-soil-soft">운영자만 볼 수 있는 화면이에요. 처리 결과는 신고한 사람에게 🔔 알림으로 가요.</p>
      <Suspense fallback={<RowListSkeleton />}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Reports({ searchParams }: { searchParams: PageProps<"/admin/reports">["searchParams"] }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/reports");
  if (!user.isAdmin) notFound();

  const { status: s } = await searchParams;
  const status = STATUSES.includes(s as (typeof STATUSES)[number]) ? (s as string) : "접수";
  const supabase = await createClient();
  const [{ data }, now, counts] = await Promise.all([
    supabase
      .from("reports")
      .select("*, reporter:profiles!reports_reporter_id_fkey(nickname)")
      .eq("status", status)
      .order("created_at", { ascending: status === "접수" }) // 접수: 오래된 것부터 처리
      .limit(100),
    getRequestTime(),
    Promise.all(STATUSES.map((st) => supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", st))),
  ]);
  const reports = (data ?? []) as Report[];

  // 신고 대상 정보: 판매글은 제목·숨김 여부, 판매글 댓글은 어느 글의 댓글인지
  const itemIds = reports.filter((r) => r.target_type === "item").map((r) => Number(r.target_id));
  const commentIds = reports.filter((r) => r.target_type === "comment" && /^\d+$/.test(r.target_id)).map((r) => Number(r.target_id));
  const [items, comments] = await Promise.all([
    itemIds.length ? supabase.from("items").select("id, title, is_hidden").in("id", itemIds) : Promise.resolve({ data: [] }),
    commentIds.length ? supabase.from("item_comments").select("id, item_id, body").in("id", commentIds) : Promise.resolve({ data: [] }),
  ]);
  const itemMap = new Map((items.data ?? []).map((i) => [String(i.id), i as { id: number; title: string; is_hidden: boolean }]));
  const commentMap = new Map((comments.data ?? []).map((c) => [String(c.id), c as { id: number; item_id: number; body: string }]));

  const tab = (active: boolean) =>
    `rounded-full border-2 px-3 py-1 text-sm ${active ? "border-soil bg-skin text-white" : "border-soil/30 bg-[#fffaf0] hover:border-skin"}`;

  return (
    <>
      <nav className="mt-4 flex gap-2">
        {STATUSES.map((st, i) => (
          <Link key={st} href={`/admin/reports?status=${st}`} className={tab(st === status)}>
            {st} {counts[i].count ?? 0}
          </Link>
        ))}
      </nav>

      {reports.length === 0 ? (
        <p className="stitch mt-6 px-4 py-10 text-center text-soil-soft">‘{status}’ 상태의 신고가 없어요. 🕊️</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {reports.map((r) => {
            const item = itemMap.get(r.target_id);
            const comment = commentMap.get(r.target_id);
            const postComment = r.target_type === "comment" && r.target_id.startsWith("post-");
            return (
              <li key={r.id} className="card-sack px-5 py-4">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-md bg-ember px-2 py-0.5 text-xs text-white">{r.reason}</span>
                  <b>{TYPE_LABEL[r.target_type] ?? r.target_type}</b>
                  <span className="text-xs text-soil-soft">
                    신고자 {r.reporter?.nickname ?? "알 수 없음"} · {timeAgo(r.created_at, now)}
                  </span>
                </p>

                {/* 신고 대상 바로가기 */}
                <div className="mt-2 text-sm">
                  {r.target_type === "item" && (
                    item ? (
                      <Link href={`/items/${item.id}`} className="underline underline-offset-2 hover:text-skin">
                        {item.is_hidden && "🙈 "}
                        {item.title}
                      </Link>
                    ) : (
                      <span className="text-soil-soft">이미 지워진 판매글</span>
                    )
                  )}
                  {r.target_type === "user" && (
                    <Link href={`/users/${r.target_id}`} className="underline underline-offset-2 hover:text-skin">사용자 프로필 보기</Link>
                  )}
                  {r.target_type === "post" && (
                    <Link href={`/community/${r.target_id}`} className="underline underline-offset-2 hover:text-skin">동네생활 글 보기</Link>
                  )}
                  {r.target_type === "comment" && !postComment && (
                    comment ? (
                      <Link href={`/items/${comment.item_id}`} className="hover:text-skin">“{comment.body.slice(0, 60)}”</Link>
                    ) : (
                      <span className="text-soil-soft">이미 지워진 댓글</span>
                    )
                  )}
                  {postComment && <span className="text-soil-soft">동네생활 댓글 #{r.target_id.slice(5)}</span>}
                  {r.target_type === "chat" && (
                    <span className="text-soil-soft">채팅방 #{r.target_id} (대화 내용은 개인정보라 운영자도 볼 수 없어요. 신고 내용으로 판단해요)</span>
                  )}
                </div>
                {r.detail && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-hanji-deep px-3 py-2 text-sm">{r.detail}</p>}
                {r.status !== "접수" && (
                  <p className="mt-2 text-xs text-soil-soft">
                    {r.status} · {r.handled_at ? timeAgo(r.handled_at, now) : ""} {r.admin_note && `— ${r.admin_note}`}
                  </p>
                )}

                {/* 바로 조치하기 */}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {item && (
                    <form action={setItemHidden.bind(null, item.id, !item.is_hidden, `/admin/reports?status=${status}`)}>
                      <button type="submit" className="btn-straw px-3! py-1! text-xs">{item.is_hidden ? "👀 글 다시 보이기" : "🙈 판매글 숨기기"}</button>
                    </form>
                  )}
                  {comment && (
                    <form action={adminDelete.bind(null, "item_comment", comment.id)}>
                      <button type="submit" className="btn-straw px-3! py-1! text-xs">🗑️ 댓글 지우기</button>
                    </form>
                  )}
                  {postComment && (
                    <form action={adminDelete.bind(null, "post_comment", Number(r.target_id.slice(5)))}>
                      <button type="submit" className="btn-straw px-3! py-1! text-xs">🗑️ 댓글 지우기</button>
                    </form>
                  )}
                  {r.target_type === "post" && /^\d+$/.test(r.target_id) && (
                    <form action={adminDelete.bind(null, "post", Number(r.target_id))}>
                      <button type="submit" className="btn-straw px-3! py-1! text-xs">🗑️ 동네생활 글 지우기</button>
                    </form>
                  )}
                </div>

                {r.status === "접수" && (
                  <form className="mt-3 flex flex-col gap-2 border-t-2 border-dashed border-straw pt-3 sm:flex-row">
                    <input name="note" maxLength={300} placeholder="처리 메모 (신고한 사람에게 보여요)" className="field flex-1 py-2!" />
                    <button formAction={handleReport.bind(null, r.id, "처리완료")} className="btn-goguma px-4! py-2! text-sm!">✅ 처리완료</button>
                    <button formAction={handleReport.bind(null, r.id, "반려")} className="btn-straw text-sm">반려</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
