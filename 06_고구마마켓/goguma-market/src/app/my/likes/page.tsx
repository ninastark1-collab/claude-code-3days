import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ItemList, { EmptyBox } from "@/components/ItemList";
import { getCurrentUser } from "@/lib/auth";
import { getLikedItems } from "@/lib/social";

export const metadata: Metadata = { title: "관심목록 · 고구마마켓" };

// 내가 ♡ 누른 판매글 모아 보기
export default function LikesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/my" className="text-sm text-soil-soft hover:text-skin">← 나의 고구마</Link>
      <h1 className="mt-3 font-display text-3xl">관심목록 ♡</h1>
      <div className="mt-6">
        <Suspense fallback={<p className="py-14 text-center text-soil-soft">고구마 캐는 중…</p>}>
          <Liked />
        </Suspense>
      </div>
    </div>
  );
}

async function Liked() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/likes");
  const items = await getLikedItems(user.id);
  return (
    <ItemList
      items={items}
      empty={
        <EmptyBox emoji="♡" title="아직 찜한 물건이 없어요" desc="마음에 드는 물건의 ♡를 눌러 모아 보세요.">
          <Link href="/" className="btn-goguma mt-3 px-4! py-2! text-sm!">물건 구경하러 가기</Link>
        </EmptyBox>
      }
    />
  );
}
