import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import PushToggle from "@/components/PushToggle";
import { Avatar, TempBadge } from "@/components/Avatar";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "나의 고구마 · 고구마마켓" };

// href가 있는 메뉴만 들어갈 수 있고, 나머지는 '준비 중'이에요.
type Menu = { icon: string; label: string; href?: string };
const MY_MENUS: { group: string; items: Menu[] }[] = [
  { group: "나의 거래", items: [
    { icon: "🧺", label: "판매내역", href: "/my/sales" },
    { icon: "🛍️", label: "구매내역", href: "/my/purchases" },
    { icon: "♡", label: "관심목록", href: "/my/likes" },
    { icon: "💌", label: "받은 거래 후기", href: "/users/me" },
  ] },
  { group: "나의 동네", items: [
    { icon: "📍", label: "동네 인증 (위치로 확인)", href: "/my/region" },
    { icon: "🌾", label: "내가 쓴 동네생활 글", href: "/community?mine=1" },
    { icon: "🔔", label: "알림", href: "/notifications" },
    { icon: "🏷️", label: "키워드 알림", href: "/my/keywords" },
  ] },
  { group: "계정", items: [
    { icon: "🍠", label: "내 정보 수정", href: "/my/edit" },
    { icon: "🔑", label: "비밀번호 바꾸기", href: "/my/password" },
    { icon: "🚫", label: "차단한 사용자", href: "/my/blocks" },
  ] },
];

export default function MyPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Suspense fallback={<div className="card-sack h-56 animate-pulse" />}>
        <Profile />
      </Suspense>

      {/* 푸시 알림 켜기/끄기 (이 기기 기준) */}
      <section className="mt-6">
        <Suspense fallback={<div className="stitch h-20 animate-pulse" />}>
          <PushSection />
        </Suspense>
      </section>

      {MY_MENUS.map((m) => (
        <section key={m.group} className="mt-8">
          <h2 className="mb-2 px-1 font-display text-lg">{m.group}</h2>
          <ul className="stitch divide-y-2 divide-dashed divide-straw bg-[#fffaf0]/70">
            {m.items.map((it) => (
              <li key={it.label}>
                {it.href ? (
                  <Link href={it.href} className="flex items-center justify-between px-4 py-3.5 hover:bg-flesh-soft/40">
                    <span className="flex items-center gap-3">
                      <span className="text-xl">{it.icon}</span>
                      {it.label}
                    </span>
                    <span className="text-soil-soft">›</span>
                  </Link>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <span className="flex items-center gap-3">
                      <span className="text-xl">{it.icon}</span>
                      {it.label}
                    </span>
                    <span className="text-xs text-soil-soft">준비 중</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// 로그인한 사람만 볼 수 있는 정보 (proxy.ts에서 한 번 막고, 여기서 한 번 더 확인)
async function Profile() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my");

  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" })
    : "-";

  return (
    <div className="card-sack px-6 py-6">
      <div className="flex items-center gap-4">
        <Avatar emoji={user.avatar} size={72} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl">{user.nickname}</h1>
          <p className="text-sm text-soil-soft">
            📍 {user.region ?? "동네를 아직 정하지 않았어요"}
            {user.regionVerified ? (
              <span className="ml-1 text-leaf">✅ 인증</span>
            ) : (
              <Link href="/my/region" className="ml-1 underline underline-offset-2 hover:text-skin">인증하기</Link>
            )}
          </p>
          <p className="mt-1 truncate text-xs text-soil-soft">{user.email}</p>
        </div>
      </div>

      {/* 고구마 온도: 거래 후기로 오르내려요 (당근의 매너온도처럼) */}
      <div className="mt-5">
        <TempBadge temp={user.temp} />
        <p className="mt-1 text-xs text-soil-soft">거래 후기를 받을수록 따뜻해져요 · 가입일 {joined}</p>
      </div>

      {/* 운영자에게만 보이는 바로가기 */}
      {user.isAdmin && (
        <Link href="/admin/reports" className="mt-5 block rounded-xl border-2 border-soil bg-skin px-4 py-2.5 text-center font-display text-white">
          🛡️ 운영자: 신고 처리하러 가기
        </Link>
      )}

      <div className="mt-5 flex gap-2">
        <Link href={`/users/${user.id}`} className="btn-straw flex-1 text-center text-sm">내 프로필 보기</Link>
        <Link href="/write" className="btn-goguma flex-1 px-3! py-2! text-sm!">+ 내 물건 팔기</Link>
        <LogoutButton className="btn-straw text-sm h-full" />
      </div>
    </div>
  );
}

async function PushSection() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <PushToggle userId={user.id} />;
}
