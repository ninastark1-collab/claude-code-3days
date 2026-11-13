import { Suspense } from "react";
import Link from "next/link";
import GogumaLogo from "@/components/GogumaLogo";
import SearchBar from "@/components/SearchBar";
import CategoryGrid from "@/components/CategoryGrid";
import ItemList, { EmptyBox } from "@/components/ItemList";
import { getCurrentUser } from "@/lib/auth";
import { findItems } from "@/lib/items";
import { AREA_RANGES, safeLimit } from "@/lib/market";
import { nearbyRegions } from "@/lib/geo";
import { ItemGridSkeleton } from "@/components/Skeletons";
import { RecentlyViewed } from "@/components/ViewTracker";

const HOT_KEYWORDS = ["고구마", "김장", "패딩", "자전거", "유모차", "캠핑"];

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <Suspense fallback={null}>
        <Welcome searchParams={searchParams} />
      </Suspense>

      {/* 검색 */}
      <section>
        <SearchBar />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-soil-soft">인기 검색어</span>
          {HOT_KEYWORDS.map((k) => (
            <Link
              key={k}
              href={`/search?q=${encodeURIComponent(k)}`}
              className="rounded-full border border-soil/30 bg-[#fffaf0] px-2.5 py-1 hover:border-skin hover:text-skin"
            >
              {k}
            </Link>
          ))}
        </div>
      </section>

      {/* 배너 */}
      <section className="card-sack mt-6 flex items-center gap-4 overflow-hidden px-5 py-5 sm:px-8">
        <div className="flex-1">
          <p className="text-xs text-soil-soft">우리 동네 밭에서 캐낸 중고거래</p>
          <h1 className="mt-1 font-display text-2xl leading-snug sm:text-3xl">
            흙 털고 건네는 <span className="text-skin">구수한</span> 우리 동네 장터
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <Suspense fallback={<span className="h-10" />}>
              <BannerActions />
            </Suspense>
          </div>
        </div>
        <div className="hidden shrink-0 sm:block">
          <GogumaLogo size={130} steaming />
        </div>
      </section>

      {/* 최근 본 상품 (이 브라우저에 저장된 목록) */}
      <RecentlyViewed />

      {/* 카테고리 */}
      <section className="mt-10">
        <h2 className="mb-4 font-display text-xl">어떤 물건을 찾으세요?</h2>
        <CategoryGrid />
      </section>

      {/* 매물 목록: 전체 / 내 동네 탭 + 더 보기 */}
      <section className="mt-12">
        <Suspense fallback={<><h2 className="mb-4 font-display text-xl">방금 올라온 우리 동네 매물 🌱</h2><ItemGridSkeleton /></>}>
          <LatestItems searchParams={searchParams} />
        </Suspense>
      </section>

      {/* 글쓰기 떠 있는 버튼 (PC) */}
      <Link
        href="/write"
        className="btn-goguma fixed bottom-8 right-8 z-20 hidden h-14 w-14 rounded-full! p-0! text-3xl! md:inline-flex"
        aria-label="내 물건 팔기"
      >
        +
      </Link>
    </div>
  );
}

// 가입/로그인 직후(?welcome=1) 환영 인사
async function Welcome({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { welcome } = await searchParams;
  if (!welcome) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <p className="card-sack mb-6 px-5 py-3 font-display text-lg text-leaf">
      🌱 {user.nickname}님, 고구마밭에 오신 걸 환영해요!
    </p>
  );
}

const PAGE = 24; // 한 번에 보여 줄 개수 (더 보기를 누를 때마다 이만큼 늘어나요)

async function LatestItems({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { area, n } = await searchParams;
  const user = await getCurrentUser();
  const myRegion = user?.region ?? null;
  // 범위: 전체 / 우리 동네만(mine) / 근처(near) / 넓게(wide) — 동네를 정해 둔 사람만
  const range = AREA_RANGES.find((r) => r.value === area);
  const scope = myRegion && (area === "mine" || range) ? (area as string) : "all";
  const limit = safeLimit(n, PAGE, 300);

  // 근처·넓게: 위치표에서 내 동네로부터 km 안의 동네 이름들을 찾아요.
  // 내 동네 위치를 모르면(지도에 없는 이름) 우리 동네 글만 보여 주고 안내해요.
  const near = range && myRegion ? await nearbyRegions(myRegion, range.km) : null;
  const unknownSpot = !!range && !!myRegion && !near;
  const { items, hasMore } = await findItems({
    region: scope === "mine" || unknownSpot ? myRegion! : undefined,
    regions: near ? near.map((r) => r.name) : undefined,
    limit,
    hideBlocked: user?.id,
  });

  const short = (name: string) => name.split(" ").pop();
  const tab = (active: boolean) =>
    `rounded-full border-2 px-3 py-1 text-sm ${active ? "border-soil bg-skin text-white" : "border-soil/30 bg-[#fffaf0] hover:border-skin"}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">방금 올라온 {scope === "all" ? "우리 동네" : range ? range.label : "내 동네"} 매물 🌱</h2>
        <nav className="flex flex-wrap gap-1.5" aria-label="동네 범위">
          <Link href="/" scroll={false} className={tab(scope === "all")}>전체</Link>
          {myRegion ? (
            <>
              <Link href="/?area=mine" scroll={false} className={tab(scope === "mine")}>📍 {short(myRegion)}</Link>
              {AREA_RANGES.map((r) => (
                <Link key={r.value} href={`/?area=${r.value}`} scroll={false} className={tab(scope === r.value)}>
                  {r.label} <span className="text-xs opacity-80">~{r.km}km</span>
                </Link>
              ))}
            </>
          ) : (
            <Link href={user ? "/my/edit" : "/login?next=/my/edit"} className={tab(false)}>📍 내 동네 정하기</Link>
          )}
        </nav>
      </div>
      {/* 근처 범위에 들어간 동네들을 알려 줘요 */}
      {near && (
        <p className="-mt-2 mb-4 text-xs text-soil-soft">
          📍 {short(myRegion!)}
          {near.length > 1
            ? ` + ${near.filter((r) => r.name !== myRegion).map((r) => short(r.name)).join("·")} (${range!.km}km 안 ${near.length}개 동네)`
            : ` — ${range!.km}km 안에 아직 다른 동네 글이 없어요`}
        </p>
      )}
      {unknownSpot && (
        <p className="-mt-2 mb-4 text-xs text-soil-soft">
          ‘{myRegion}’의 위치를 지도에서 찾지 못해서 우리 동네 글만 보여 드려요.{" "}
          <Link href="/my/region" className="underline underline-offset-2 hover:text-skin">동네 인증</Link>을 하면 근처 동네도 볼 수 있어요.
        </p>
      )}
      <ItemList
        items={items}
        empty={
          <EmptyBox
            emoji="🌱"
            title={scope === "all" ? "아직 밭이 비어 있어요" : range ? `${range.km}km 안에는 아직 물건이 없어요` : "아직 우리 동네엔 물건이 없어요"}
            desc="첫 번째로 물건을 올려 보세요!"
          >
            <Link href="/write" className="btn-goguma mt-3 px-4! py-2! text-sm!">+ 내 물건 팔기</Link>
          </EmptyBox>
        }
      />
      {hasMore && (
        <div className="mt-8 text-center">
          <Link
            href={`/?${new URLSearchParams({ ...(scope !== "all" ? { area: scope } : {}), n: String(limit + PAGE) })}`}
            scroll={false}
            className="btn-straw"
          >
            더 보기 ↓
          </Link>
        </div>
      )}
    </>
  );
}

async function BannerActions() {
  const user = await getCurrentUser();
  if (user)
    return (
      <Link href="/write" className="btn-goguma px-4! py-2! text-sm!">
        + 내 물건 팔기
      </Link>
    );

  return (
    <>
      <Link href="/signup" className="btn-goguma px-4! py-2! text-sm!">고구마 캐러 가기</Link>
      <Link href="/login" className="btn-straw text-sm">이미 회원이에요</Link>
    </>
  );
}
