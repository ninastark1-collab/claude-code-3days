import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ItemList, { EmptyBox } from "@/components/ItemList";
import { findItems } from "@/lib/items";
import { getCurrentUser } from "@/lib/auth";
import { ItemGridSkeleton } from "@/components/Skeletons";
import { CATEGORIES, getCategory } from "@/lib/market";

// 카테고리 페이지는 빌드할 때 미리 만들어 둡니다.
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${getCategory(slug)?.name ?? "카테고리"} · 고구마마켓` };
}

export default async function CategoryPage({ params }: PageProps<"/category/[slug]">) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/" className="text-sm text-soil-soft hover:text-skin">← 홈으로</Link>
      <h1 className="mt-3 flex items-center gap-3 font-display text-3xl">
        <span className="text-4xl">{category.emoji}</span>
        {category.name}
      </h1>

      {/* 다른 카테고리로 빠르게 이동 */}
      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className={`shrink-0 rounded-full border-2 px-3 py-1 text-sm ${
              c.slug === slug ? "border-soil bg-skin text-white" : "border-soil/30 bg-[#fffaf0] hover:border-skin"
            }`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {/* 이 카테고리의 판매글: 요청 때마다 DB에서 불러와요 */}
      <div className="mt-6">
        <Suspense fallback={<ItemGridSkeleton />}>
          <CategoryItems slug={slug} />
        </Suspense>
      </div>
    </div>
  );
}

async function CategoryItems({ slug }: { slug: string }) {
  const user = await getCurrentUser();
  const { items } = await findItems({ category: slug, limit: 120, hideBlocked: user?.id });
  return (
    <ItemList
      items={items}
      empty={
        <EmptyBox emoji="🌱" title="아직 이 밭엔 물건이 없어요" desc="첫 번째로 물건을 올려 보세요!">
          <Link href="/write" className="btn-goguma mt-3 px-4! py-2! text-sm!">+ 내 물건 팔기</Link>
        </EmptyBox>
      }
    />
  );
}
