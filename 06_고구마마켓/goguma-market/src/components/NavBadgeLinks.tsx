"use client";
// 위쪽 머리말(PC·휴대폰)의 🔔 알림 / 💬 채팅 아이콘 + 안 읽은 숫자
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge, useBadges } from "@/components/useBadges";

export default function NavBadgeLinks() {
  const { chat, noti } = useBadges(usePathname());
  return (
    <>
      <Link href="/chat" className="relative hidden text-xl md:inline" aria-label="채팅">
        💬
        <Badge n={chat} className="absolute -right-2.5 -top-1.5" />
      </Link>
      <Link href="/notifications" className="relative text-xl" aria-label="알림">
        🔔
        <Badge n={noti} className="absolute -right-2.5 -top-1.5" />
      </Link>
    </>
  );
}
