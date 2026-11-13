import { Suspense } from "react";
import Link from "next/link";
import GogumaLogo from "@/components/GogumaLogo";
import LogoutButton from "@/components/LogoutButton";
import NavBadgeLinks from "@/components/NavBadgeLinks";
import { OnlineCount, PresenceIdentity } from "@/components/Presence";
import { NAV_ITEMS } from "@/components/nav";
import { getCurrentUser } from "@/lib/auth";

// 헤더 껍데기(로고, 메뉴)는 미리 만들어 두고(static),
// 로그인 상태에 따라 바뀌는 오른쪽 부분만 요청 때마다 그립니다(Suspense).
export default function Header() {
  return (
    <header className="sticky top-0 z-20 border-b-2 border-soil bg-hanji/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-6">
          {/* whitespace-nowrap: 좁은 휴대폰에서도 로고 글자가 두 줄로 꺾이지 않게 */}
          <Link href="/" className="flex shrink-0 items-center gap-1.5 whitespace-nowrap sm:gap-2">
            <GogumaLogo size={34} />
            <span className="font-display text-xl text-skin sm:text-2xl">
              고구마<span className="text-soil">마켓</span>
            </span>
          </Link>
          {/* PC 화면 메뉴 (휴대폰은 아래 고정 메뉴) */}
          <nav className="hidden items-center gap-5 md:flex">
            {NAV_ITEMS.filter((n) => !n.primary && n.href !== "/my").map((n) => (
              <Link key={n.href} href={n.href} className="font-display text-soil-soft hover:text-skin">
                {n.href === "/" ? "중고거래" : n.label}
              </Link>
            ))}
          </nav>
          <OnlineCount />
        </div>

        <Suspense fallback={<span className="h-9 w-32 animate-pulse rounded-full bg-hanji-deep" />}>
          <UserNav />
        </Suspense>
      </div>
    </header>
  );
}

async function UserNav() {
  const user = await getCurrentUser();

  return (
    <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm sm:gap-3">
      {/* 접속 중 표시: 지금 로그인한 사람으로 연결 (로그아웃·다른 계정 로그인 시 다시 연결) */}
      <PresenceIdentity userId={user?.id} share={!!user?.showOnline} />
      {user ? (
        <>
          <Link href="/my/edit" className="hidden rounded-full border-2 border-soil/30 px-3 py-1 text-xs text-soil-soft hover:border-skin sm:inline">
            📍 {user.region ?? "동네 미설정"}
          </Link>
          <NavBadgeLinks />
          <Link href="/write" className="btn-goguma hidden px-4! py-1.5! text-sm! md:inline-flex">
            + 내 물건 팔기
          </Link>
          <Link href="/my" className="hidden font-display text-soil hover:text-skin md:inline">
            {user.nickname}님
          </Link>
          <LogoutButton />
        </>
      ) : (
        <>
          <Link href="/login" className="whitespace-nowrap font-display text-soil hover:text-skin">로그인</Link>
          <Link href="/signup" className="btn-straw whitespace-nowrap px-3! py-1.5! text-sm">회원가입</Link>
        </>
      )}
    </div>
  );
}
