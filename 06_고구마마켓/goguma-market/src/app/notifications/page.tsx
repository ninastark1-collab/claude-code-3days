import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { EmptyBox } from "@/components/ItemList";
import MarkNotificationsRead from "@/components/MarkNotificationsRead";
import PushToggle from "@/components/PushToggle";
import { RowListSkeleton } from "@/components/Skeletons";
import { getCurrentUser } from "@/lib/auth";
import { getRequestTime } from "@/lib/items";
import { timeAgo } from "@/lib/market";
import { getMyNotifications, type Notification } from "@/lib/trust";

export const metadata: Metadata = { title: "알림 · 고구마마켓" };

// 알림 종류마다 문장과 눌렀을 때 갈 곳
function describe(n: Notification) {
  const who = n.actor?.nickname ?? "누군가";
  const title = n.item?.title ? `‘${n.item.title}’` : n.item_id ? "판매글" : "내 글";
  switch (n.type) {
    case "comment":
      return { text: `${who}님이 ${title}에 댓글을 남겼어요`, sub: n.body, href: `/items/${n.item_id}` };
    case "like":
      return { text: `${who}님이 ${title}을(를) 관심목록에 담았어요 ♡`, sub: "", href: `/items/${n.item_id}` };
    case "review":
      return { text: `${who}님이 거래 후기를 보냈어요 💌`, sub: n.body, href: "/users/me" };
    case "sold":
      return { text: `${who}님과 ${title} 거래가 완료됐어요. 후기를 남겨 주세요!`, sub: "", href: `/items/${n.item_id}` };
    case "keyword":
      return { text: `키워드 ‘${n.body}’이(가) 들어간 새 물건이 올라왔어요 🏷️ ${title}`, sub: "", href: `/items/${n.item_id}` };
    case "report":
      return { text: `내가 한 신고가 처리됐어요: ${n.body}`, sub: "", href: "/my" };
    case "reply":
      return { text: `${who}님이 내 댓글에 답글을 남겼어요 ↳`, sub: n.body, href: n.item_id ? `/items/${n.item_id}` : `/community/${n.post_id}` };
    case "price_drop":
      return { text: `관심 상품 ${title}의 가격이 내려갔어요 📉`, sub: n.body, href: `/items/${n.item_id}` };
    case "post_comment":
      return { text: `${who}님이 내 동네생활 글에 댓글을 남겼어요`, sub: n.body, href: `/community/${n.post_id}` };
  }
}

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl">알림 🔔</h1>
      <Suspense fallback={<RowListSkeleton />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");
  const [items, now] = await Promise.all([getMyNotifications(user.id), getRequestTime()]);

  if (items.length === 0)
    return (
      <div className="mt-6">
        <EmptyBox emoji="🔔" title="아직 알림이 없어요" desc="내 글에 댓글·좋아요가 달리거나 후기를 받으면 여기에 알려 드려요." />
      </div>
    );

  return (
    <>
      {/* 사이트를 닫아도 알림이 오게 */}
      <div className="mt-6">
        <PushToggle userId={user.id} />
      </div>
      {/* 화면을 열면 모두 읽음으로 바꿔요 (메뉴의 빨간 숫자가 사라져요) */}
      <MarkNotificationsRead upToId={Math.max(...items.map((n) => n.id))} />
      <ul className="stitch mt-6 divide-y-2 divide-dashed divide-straw bg-[#fffaf0]/70">
        {items.map((n) => {
          const d = describe(n);
          // 판매글 알림인데 글을 못 불러왔으면(운영자가 숨김) 눌러도 갈 곳이 없으니 링크 없이 흐리게 보여 줘요.
          const gone = !!n.item_id && !n.item;
          const rowClass = `flex gap-3 px-4 py-3.5 ${gone ? "opacity-60" : "hover:bg-flesh-soft/40"} ${n.read_at ? "" : "bg-flesh-soft/30"}`;
          const body = (
            <>
                <Avatar emoji={n.actor?.avatar} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug">
                    {!n.read_at && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-ember align-middle" aria-label="새 알림" />}
                    {d.text}
                  </span>
                  {d.sub && <span className="mt-0.5 block truncate text-xs text-soil-soft">“{d.sub}”</span>}
                  <span className="mt-0.5 block text-[11px] text-soil-soft">
                    {timeAgo(n.created_at, now)}
                    {gone && " · 지금은 볼 수 없는 글이에요"}
                  </span>
                </span>
            </>
          );
          return (
            <li key={n.id}>
              {gone ? (
                <div className={rowClass}>{body}</div>
              ) : (
                <Link href={d.href} className={rowClass}>{body}</Link>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
