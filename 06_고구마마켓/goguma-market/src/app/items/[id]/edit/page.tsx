import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ItemForm from "@/components/ItemForm";
import { updateItem } from "@/app/items/actions";
import { getCurrentUser } from "@/lib/auth";
import { getItem } from "@/lib/items";

export const metadata: Metadata = { title: "판매글 고치기 · 고구마마켓" };

export default function EditItemPage({ params }: PageProps<"/items/[id]/edit">) {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Suspense fallback={<p className="py-20 text-center text-soil-soft">고구마 캐는 중…</p>}>
        <EditForm params={params} />
      </Suspense>
    </div>
  );
}

async function EditForm({ params }: { params: PageProps<"/items/[id]/edit">["params"] }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/items/${id}/edit`);

  const item = await getItem(id);
  if (!item) notFound();
  // 남의 글이면 고칠 수 없으니 상세 화면으로 돌려보내요.
  if (item.seller_id !== user.id) redirect(`/items/${id}`);

  return (
    <>
      <Link href={`/items/${id}`} className="text-sm text-soil-soft hover:text-skin">← 글로 돌아가기</Link>
      <div className="card-sack mt-3 px-5 py-6 sm:px-8">
        <h1 className="font-display text-3xl">판매글 고치기 ✏️</h1>
        <div className="mt-6">
          {/* bind: 어떤 글을 고칠지(id)를 미리 넣어 둔 액션 */}
          <ItemForm action={updateItem.bind(null, item.id)} item={item} />
        </div>
      </div>
    </>
  );
}
