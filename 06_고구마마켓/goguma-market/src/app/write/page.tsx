import type { Metadata } from "next";
import Link from "next/link";
import ItemForm from "@/components/ItemForm";
import { createItem } from "@/app/items/actions";

export const metadata: Metadata = { title: "내 물건 팔기 · 고구마마켓" };

// 판매글 쓰기 화면 (로그인 안 했으면 proxy.ts가 로그인 화면으로 보내요)
export default function WritePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Link href="/" className="text-sm text-soil-soft hover:text-skin">← 홈으로</Link>
      <div className="card-sack mt-3 px-5 py-6 sm:px-8">
        <h1 className="font-display text-3xl">내 물건 팔기 🧺</h1>
        <p className="mt-1 text-sm text-soil-soft">사진은 최대 10장까지 올릴 수 있어요.</p>
        <div className="mt-6">
          <ItemForm action={createItem} />
        </div>
      </div>
    </div>
  );
}
