import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { BlockButton } from "@/components/SafetyButtons";
import { EmptyBox } from "@/components/ItemList";
import { RowListSkeleton } from "@/components/Skeletons";
import { getCurrentUser } from "@/lib/auth";
import { getMyBlocks } from "@/lib/trust";

export const metadata: Metadata = { title: "차단한 사용자 · 고구마마켓" };

export default function BlocksPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Link href="/my" className="text-sm text-soil-soft hover:text-skin">← 나의 고구마</Link>
      <h1 className="mt-3 font-display text-3xl">차단한 사용자 🚫</h1>
      <Suspense fallback={<RowListSkeleton count={3} />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/blocks");
  const blocks = await getMyBlocks(user.id);
  if (blocks.length === 0)
    return (
      <div className="mt-6">
        <EmptyBox emoji="🕊️" title="차단한 사용자가 없어요" desc="불편한 사용자는 프로필이나 채팅방에서 차단할 수 있어요." />
      </div>
    );
  return (
    <ul className="stitch mt-6 divide-y-2 divide-dashed divide-straw bg-[#fffaf0]/70">
      {blocks.map((b) => (
        <li key={b.id} className="flex items-center gap-3 px-4 py-3">
          <Avatar emoji={b.avatar} size={40} />
          <Link href={`/users/${b.id}`} className="flex-1 font-display hover:text-skin">{b.nickname}</Link>
          <BlockButton otherId={b.id} nickname={b.nickname} back="/my/blocks" blocked className="btn-straw text-xs" />
        </li>
      ))}
    </ul>
  );
}
