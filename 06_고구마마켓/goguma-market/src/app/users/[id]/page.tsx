import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar, TempBadge } from "@/components/Avatar";
import ItemList, { EmptyBox } from "@/components/ItemList";
import { BlockButton, ReportButton } from "@/components/SafetyButtons";
import { DetailSkeleton } from "@/components/Skeletons";
import { OnlineStatus } from "@/components/Presence";
import { getCurrentUser } from "@/lib/auth";
import { findItems, getRequestTime } from "@/lib/items";
import { RATINGS, timeAgo, type Rating } from "@/lib/market";
import { getProfile, getReviewsFor, isBlockedByMe } from "@/lib/trust";

export const metadata: Metadata = { title: "프로필 · 고구마마켓" };

// 판매자(사용자) 프로필: 고구마 온도, 받은 후기, 올린 물건. /users/me 는 내 프로필
export default function UserPage({ params }: PageProps<"/users/[id]">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Suspense fallback={<DetailSkeleton />}>
        <UserProfile params={params} />
      </Suspense>
    </div>
  );
}

async function UserProfile({ params }: { params: PageProps<"/users/[id]">["params"] }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (id === "me") redirect(me ? `/users/${me.id}` : "/login?next=/users/me");

  const profile = await getProfile(id);
  if (!profile) notFound();

  const isMe = me?.id === profile.id;
  const [{ items }, reviews, blocked, now] = await Promise.all([
    findItems({ sellerId: profile.id, limit: 60 }),
    getReviewsFor(profile.id),
    isBlockedByMe(me?.id, profile.id),
    getRequestTime(),
  ]);
  const counts: Record<Rating, number> = { good: 0, soso: 0, bad: 0 };
  for (const r of reviews) counts[r.rating] += 1;
  const joined = new Date(profile.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", timeZone: "Asia/Seoul" });

  return (
    <>
      <section className="card-sack mx-auto max-w-2xl px-6 py-6">
        <div className="flex items-center gap-4">
          <Avatar emoji={profile.avatar} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl">
              {profile.nickname}
              {isMe && <span className="ml-2 text-sm text-soil-soft">(나)</span>}
            </h1>
            <p className="text-sm text-soil-soft">
              📍 {profile.region ?? "동네 미설정"}
              {profile.region_verified_at && <span className="ml-1 text-leaf">✅ 동네 인증</span>} · {joined} 가입
            </p>
            <OnlineStatus userId={profile.id} lastSeenText={profile.last_seen_at ? timeAgo(profile.last_seen_at, now) : null} />
          </div>
        </div>
        <div className="mt-5">
          <TempBadge temp={profile.manner_temp} />
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {(Object.keys(RATINGS) as Rating[]).map((r) => (
            <span key={r}>
              {RATINGS[r].emoji} {RATINGS[r].label} <b>{counts[r]}</b>
            </span>
          ))}
        </p>
        {isMe ? (
          <Link href="/my/edit" className="btn-straw mt-5 block text-center text-sm">내 정보 수정</Link>
        ) : me ? (
          <div className="mt-5 flex items-center justify-end gap-4">
            <ReportButton targetType="user" targetId={profile.id} back={`/users/${profile.id}`} />
            <BlockButton otherId={profile.id} nickname={profile.nickname} back={`/users/${profile.id}`} blocked={blocked} />
          </div>
        ) : null}
        {blocked && (
          <p className="mt-3 rounded-xl bg-hanji-deep px-3 py-2 text-sm text-soil-soft">
            🚫 차단한 사용자예요. 이 사람의 글이 목록에 보이지 않고, 서로 채팅할 수 없어요.
          </p>
        )}
      </section>

      <section className="mx-auto mt-8 max-w-2xl">
        <h2 className="mb-3 font-display text-xl">
          받은 거래 후기 <span className="text-skin">{reviews.length}</span>
        </h2>
        {reviews.length === 0 ? (
          <p className="stitch px-4 py-6 text-center text-sm text-soil-soft">아직 받은 후기가 없어요.</p>
        ) : (
          <ul className="stitch divide-y-2 divide-dashed divide-straw bg-[#fffaf0]/70">
            {reviews.map((r) => (
              <li key={r.id} className="flex gap-3 px-4 py-3">
                <Avatar emoji={r.reviewer?.avatar} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <b className="font-display">{r.reviewer?.nickname ?? "알 수 없음"}</b>
                    <span className="text-xs text-soil-soft">
                      {" · "}
                      {r.item ? `${r.item.seller_id === profile.id ? "구매자" : "판매자"} · ` : ""}{timeAgo(r.created_at, now)}
                    </span>
                  </p>
                  <p className="text-sm">
                    {RATINGS[r.rating].emoji} {RATINGS[r.rating].label}
                    {r.body && ` — ${r.body}`}
                  </p>
                  {r.item ? (
                    <Link href={`/items/${r.item.id}`} className="text-xs text-soil-soft underline underline-offset-2">
                      {r.item.title}
                    </Link>
                  ) : (
                    // 판매글이 지워져도 후기는 남아요 (어떤 물건이었는지만 글자로)
                    r.item_title && <span className="text-xs text-soil-soft">{r.item_title} (지워진 글)</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-4 font-display text-xl">
          {isMe ? "내가" : `${profile.nickname}님이`} 올린 물건 <span className="text-skin">{items.length}</span>
        </h2>
        <ItemList items={items} empty={<EmptyBox emoji="🧺" title="올린 물건이 없어요" desc="" />} />
      </section>
    </>
  );
}
