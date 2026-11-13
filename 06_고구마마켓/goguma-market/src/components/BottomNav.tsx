"use client";
// 휴대폰 화면 아래 고정 메뉴 (앱처럼)
import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/components/nav";
import { Badge, useBadges } from "@/components/useBadges";

// 판매글 상세(/items/[번호])처럼 주소가 요청 때 정해지는 화면에선 현재 주소를 미리 알 수 없어요.
// 그래서 Suspense로 감싸고, 주소를 알기 전에는 '선택 표시 없는 메뉴'를 먼저 보여 줘요.
export default function BottomNav() {
  return (
    <Suspense fallback={<NavBar path="" />}>
      <CurrentNav />
    </Suspense>
  );
}

function CurrentNav() {
  return <NavBar path={usePathname()} />;
}

function NavBar({ path }: { path: string }) {
  const badges = useBadges(path); // 안 읽은 채팅 수
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-soil bg-hanji/95 backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {NAV_ITEMS.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                  active ? "font-display text-skin" : "text-soil-soft"
                }`}
              >
                {n.primary ? (
                  <span className="-mt-5 grid h-11 w-11 place-items-center rounded-full border-2 border-soil bg-skin text-xl text-white shadow-[2px_3px_0_var(--color-soil)]">
                    {n.icon}
                  </span>
                ) : (
                  <span className={`relative text-xl ${active ? "" : "grayscale-[60%]"}`}>
                    {n.icon}
                    {n.href === "/chat" && <Badge n={badges.chat} className="absolute -right-3 -top-1" />}
                  </span>
                )}
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
