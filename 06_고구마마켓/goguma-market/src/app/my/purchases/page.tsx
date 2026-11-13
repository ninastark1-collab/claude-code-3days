import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ItemList, { EmptyBox } from "@/components/ItemList";
import { ItemGridSkeleton } from "@/components/Skeletons";
import { getCurrentUser } from "@/lib/auth";
import { findItems } from "@/lib/items";

export const metadata: Metadata = { title: "구매내역 · 고구마마켓" };

// 판매자가 거래완료 때 나를 구매자로 고른 글
export default function PurchasesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/my" className="text-sm text-soil-soft hover:text-skin">← 나의 고구마</Link>
      <h1 className="mt-3 font-display text-3xl">구매내역 🛍️</h1>
      <p className="mt-1 text-sm text-soil-soft">
        판매자가 거래완료로 바꾸면서 나를 구매자로 고른 물건이에요. 상세 화면에서 후기를 남길 수 있어요.
      </p>
      <div className="mt-6">
        <Suspense fallback={<ItemGridSkeleton />}>
          <Purchases />
        </Suspense>
      </div>
    </div>
  );
}

async function Purchases() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/purchases");
  const { items } = await findItems({ buyerId: user.id, status: "거래완료", limit: 300, includeHidden: true });
  return (
    <ItemList
      items={items}
      empty={<EmptyBox emoji="🛍️" title="아직 구매한 물건이 없어요" desc="마음에 드는 물건을 찾아 채팅으로 거래해 보세요." />}
    />
  );
}
