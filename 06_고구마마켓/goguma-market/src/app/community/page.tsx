import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { EmptyBox } from "@/components/ItemList";
import { RowListSkeleton } from "@/components/Skeletons";
import { getCurrentUser } from "@/lib/auth";
import { getPosts, TOPICS, topicEmoji } from "@/lib/community";
import { getRequestTime } from "@/lib/items";
import { safeLimit, timeAgo } from "@/lib/market";

export const metadata: Metadata = { title: "동네생활 · 고구마마켓" };

const PAGE = 20;

// 동네생활 게시판 목록: 주제 고르기, 내 동네만, 내가 쓴 글
export default function CommunityPage({ searchParams }: PageProps<"/community">) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">동네생활 🌾</h1>
        <Link href="/community/write" className="btn-goguma px-4! py-2! text-sm!">✏️ 글쓰기</Link>
      </div>
      <p className="mt-1 text-sm text-soil-soft">우리 동네 이웃과 질문·맛집·소식을 나눠요.</p>
      <Suspense fallback={<RowListSkeleton />}>
        <Posts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Posts({ searchParams }: { searchParams: PageProps<"/community">["searchParams"] }) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const topic = TOPICS.some((t) => t.value === str("topic")) ? str("topic") : "";
  const user = await getCurrentUser();
  const mineOnly = str("mine") === "1" && !!user;
  const area = str("area") === "mine" && !!user?.region;
  const limit = safeLimit(str("n"), PAGE, 200);

  const [{ posts, hasMore }, now] = await Promise.all([
    getPosts({ topic, region: area ? user!.region! : undefined, authorId: mineOnly ? user!.id : undefined, limit, viewerId: user?.id }),
    getRequestTime(),
  ]);

  // 지금 조건을 유지한 채 하나만 바꾼 주소를 만들어요.
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ topic, ...(area ? { area: "mine" } : {}), ...(mineOnly ? { mine: "1" } : {}), ...patch }))
      if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/community?${qs}` : "/community";
  };
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border-2 px-3 py-1 text-sm ${active ? "border-soil bg-skin text-white" : "border-soil/30 bg-[#fffaf0] hover:border-skin"}`;

  return (
    <>
      <nav className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]" aria-label="주제">
        <Link href={link({ topic: "" })} className={chip(!topic)}>전체</Link>
        {TOPICS.map((t) => (
          <Link key={t.value} href={link({ topic: t.value })} className={chip(topic === t.value)}>
            {t.emoji} {t.value}
          </Link>
        ))}
      </nav>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {user?.region && (
          <Link href={link({ area: area ? "" : "mine" })} className={chip(area)}>📍 {user.region.split(" ").pop()}만</Link>
        )}
        {user && <Link href={link({ mine: mineOnly ? "" : "1" })} className={chip(mineOnly)}>✍️ 내가 쓴 글</Link>}
      </div>

      {posts.length === 0 ? (
        <div className="mt-6">
          <EmptyBox emoji="🌾" title="아직 이야기가 없어요" desc="첫 번째로 동네 이야기를 꺼내 보세요!">
            <Link href="/community/write" className="btn-goguma mt-3 px-4! py-2! text-sm!">✏️ 글쓰기</Link>
          </EmptyBox>
        </div>
      ) : (
        <ul className="stitch mt-4 divide-y-2 divide-dashed divide-straw bg-[#fffaf0]/70">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/community/${p.id}`} className="block px-4 py-4 hover:bg-flesh-soft/40">
                <span className="inline-block rounded-md bg-hanji-deep px-2 py-0.5 text-xs">{topicEmoji(p.topic)} {p.topic}</span>
                <span className="mt-1.5 line-clamp-2 block leading-relaxed">{p.body}</span>
                <span className="mt-2 flex items-center gap-1.5 text-xs text-soil-soft">
                  <Avatar emoji={p.author?.avatar} size={20} />
                  {p.author?.nickname ?? "알 수 없음"} · {p.region ?? "동네 미설정"} · {timeAgo(p.created_at, now)}
                  {p.comment_count > 0 && <span className="ml-auto">💬 {p.comment_count}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="mt-6 text-center">
          <Link href={link({ n: String(limit + PAGE) })} scroll={false} className="btn-straw">더 보기 ↓</Link>
        </div>
      )}
    </>
  );
}
