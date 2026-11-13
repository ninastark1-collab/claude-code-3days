import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import ItemList, { EmptyBox } from "@/components/ItemList";
import { ItemGridSkeleton } from "@/components/Skeletons";
import { getCurrentUser } from "@/lib/auth";
import { findItems, type ItemSort } from "@/lib/items";
import { CATEGORIES, CONDITIONS, safeLimit } from "@/lib/market";

export const metadata: Metadata = { title: "검색 · 고구마마켓" };

const SORTS: { value: ItemSort; label: string }[] = [
  { value: "recent", label: "최신순" },
  { value: "popular", label: "인기순(♡)" },
  { value: "low", label: "낮은 가격순" },
  { value: "high", label: "높은 가격순" },
];
const PAGE = 24;

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Suspense fallback={<><SearchBar /><div className="mt-8"><ItemGridSkeleton /></div></>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// 주소의 값(문자열)을 숫자로. 비었거나 이상하면 undefined
function num(v: string | string[] | undefined) {
  const n = Number(typeof v === "string" ? v.replace(/[,\s원]/g, "") : NaN);
  return Number.isFinite(n) && n >= 0 && typeof v === "string" && v.trim() !== "" ? n : undefined;
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const query = str("q");
  const category = CATEGORIES.some((c) => c.slug === str("category")) ? str("category") : "";
  const minPrice = num(sp.min);
  const maxPrice = num(sp.max);
  const hideDone = str("done") === "hide";
  const condition = (CONDITIONS as readonly string[]).includes(str("cond")) ? str("cond") : "";
  const sort = (SORTS.some((s) => s.value === str("sort")) ? str("sort") : "recent") as ItemSort;
  const limit = safeLimit(str("n"), PAGE, 300);
  // 검색어가 없어도 조건을 하나라도 고르면 결과를 보여 줘요.
  // '*'처럼 검색에 못 쓰는 글자만 적었으면 검색어가 없는 것으로 봐요. (전체 목록이 나오지 않게)
  const usable = query.replace(/\*/g, "").trim();
  const hasCondition = !!(usable || category || minPrice != null || maxPrice != null || hideDone || condition || str("sort"));

  const user = await getCurrentUser();
  const { items, hasMore } = hasCondition
    ? await findItems({ keyword: query, category, minPrice, maxPrice, hideDone, condition, sort, limit, hideBlocked: user?.id })
    : { items: [], hasMore: false };

  // '더 보기'는 지금 조건 그대로 개수만 늘려요.
  const moreParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "n") moreParams.set(k, v);
  moreParams.set("n", String(limit + PAGE));

  return (
    <>
      <SearchBar defaultValue={query} />

      {/* 조건 고르기: <form method="get">이라 자바스크립트 없이도 주소에 조건이 붙어요 */}
      <form action="/search" className="stitch mt-4 grid gap-3 bg-[#fffaf0]/70 px-4 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <input type="hidden" name="q" value={query} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
            카테고리
            <select name="category" defaultValue={category} className="field py-2!">
              <option value="">전체</option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            최소 가격
            <input name="min" inputMode="numeric" defaultValue={minPrice ?? ""} placeholder="0" className="field py-2!" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            최대 가격
            <input name="max" inputMode="numeric" defaultValue={maxPrice ?? ""} placeholder="제한 없음" className="field py-2!" />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
            정렬
            <select name="sort" defaultValue={sort} className="field py-2!">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          상품 상태
          <select name="cond" defaultValue={condition} className="field py-2!">
            <option value="">전체</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="done" value="hide" defaultChecked={hideDone} className="h-4 w-4 accent-[var(--color-skin)]" />
          거래완료 숨기기
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn-goguma flex-1 px-4! py-2! text-sm!">적용</button>
          <Link href={query ? `/search?q=${encodeURIComponent(query)}` : "/search"} className="btn-straw text-sm">초기화</Link>
        </div>
      </form>

      {hasCondition && (
        <p className="mt-6 font-display text-lg">
          {query ? `‘${query}’ 검색 결과` : "조건에 맞는 물건"} <span className="text-skin">{items.length}{hasMore ? "+" : ""}</span>개
        </p>
      )}
      <div className="mt-4">
        <ItemList
          items={items}
          empty={
            <EmptyBox
              emoji="🔍"
              title={hasCondition ? "앗, 찾는 물건이 아직 없어요" : "무엇을 찾고 계세요?"}
              desc={hasCondition ? "조건을 바꾸거나 다른 검색어로 찾아보세요." : "검색어를 넣거나 조건을 골라 보세요."}
            />
          }
        />
      </div>
      {hasMore && (
        <div className="mt-8 text-center">
          <Link href={`/search?${moreParams}`} scroll={false} className="btn-straw">더 보기 ↓</Link>
        </div>
      )}
    </>
  );
}
