import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ItemList, { EmptyBox } from "@/components/ItemList";
import { ItemGridSkeleton } from "@/components/Skeletons";
import { getCurrentUser } from "@/lib/auth";
import { findItems } from "@/lib/items";

export const metadata: Metadata = { title: "판매내역 · 고구마마켓" };

// 내가 올린 글: 판매중(예약중 포함) / 거래완료 탭
export default function SalesPage({ searchParams }: PageProps<"/my/sales">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/my" className="text-sm text-soil-soft hover:text-skin">← 나의 고구마</Link>
      <h1 className="mt-3 font-display text-3xl">판매내역 🧺</h1>
      <Suspense fallback={<div className="mt-6"><ItemGridSkeleton /></div>}>
        <Sales searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Sales({ searchParams }: { searchParams: PageProps<"/my/sales">["searchParams"] }) {
  const { tab } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/sales");

  const { items } = await findItems({ sellerId: user.id, limit: 300, includeHidden: true });
  const done = tab === "done";
  const shown = items.filter((i) => (i.status === "거래완료") === done);
  const tabClass = (active: boolean) =>
    `rounded-full border-2 px-3 py-1 text-sm ${active ? "border-soil bg-skin text-white" : "border-soil/30 bg-[#fffaf0] hover:border-skin"}`;

  return (
    <>
      <nav className="mt-4 flex gap-2">
        <Link href="/my/sales" className={tabClass(!done)}>판매중 {items.filter((i) => i.status !== "거래완료").length}</Link>
        <Link href="/my/sales?tab=done" className={tabClass(done)}>거래완료 {items.filter((i) => i.status === "거래완료").length}</Link>
      </nav>
      <div className="mt-6">
        <ItemList
          items={shown}
          empty={
            <EmptyBox emoji="🧺" title={done ? "아직 거래완료된 물건이 없어요" : "판매 중인 물건이 없어요"} desc="안 쓰는 물건을 동네 이웃에게 건네 보세요.">
              <Link href="/write" className="btn-goguma mt-3 px-4! py-2! text-sm!">+ 내 물건 팔기</Link>
            </EmptyBox>
          }
        />
      </div>
      <p className="mt-6 text-xs text-soil-soft">
        거래가 끝났으면 판매글 상세 화면에서 ‘거래완료’와 함께 구매자를 골라 주세요. 서로 후기를 남길 수 있어요.
      </p>
    </>
  );
}
