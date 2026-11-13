// DB(items 테이블)에서 판매글을 읽어 오는 함수들 — CRUD 중 R(Read, 읽기)
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIES, safeLimit, type Item, type ItemStatus } from "@/lib/market";

// 판매자 닉네임·프로필 이모지·고구마 온도를 profiles 테이블에서 함께 가져와요.
// !items_seller_id_fkey: items↔profiles 연결이 여러 개(판매자·구매자·좋아요·채팅·댓글…)라 "판매자 연결"이라고 콕 집어 줘요.
export const ITEM_COLUMNS = "*, seller:profiles!items_seller_id_fkey(nickname, avatar, manner_temp, region_verified_at, last_seen_at)";

export type ItemSort = "recent" | "popular" | "low" | "high";

export type ItemQuery = {
  category?: string;
  region?: string; // 이 동네 글만
  regions?: string[]; // 이 동네들 글만 (근처 동네 보기)
  keyword?: string; // 제목 또는 카테고리 이름에 들어 있으면
  minPrice?: number;
  maxPrice?: number;
  hideDone?: boolean; // 거래완료 숨기기
  condition?: string; // 상품 상태
  sort?: ItemSort;
  limit?: number;
  sellerId?: string; // 이 사람이 올린 글 (판매내역·판매자 페이지)
  buyerId?: string; // 이 사람이 산 글 (구매내역)
  status?: ItemStatus; // 이 상태인 글만
  hideBlocked?: string; // 이 사용자(나)가 차단한 사람의 글은 빼요
  includeHidden?: boolean; // 운영자가 숨긴 글도 보여 줄지 (내 판매내역·구매내역에서만 true)
};


// 내가 차단한 사람 목록 (RLS 덕분에 내 차단 목록만 보여요)
export async function getBlockedIds(userId: string | undefined) {
  if (!userId) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", userId);
  return (data ?? []).map((r) => r.blocked_id as string);
}

// PostgREST의 or() 안에 넣는 값은 따옴표로 감싸고, 따옴표·역슬래시를 escape 해요. (쉼표·괄호가 들어 있어도 안전)
function quoted(value: string) {
  return `"${value.replace(/["\\]/g, (c) => "\\" + c)}"`;
}

// 목록 하나로 홈·카테고리·검색·판매내역 모두 처리해요. hasMore: 더 보기 버튼을 보일지
export async function findItems(q: ItemQuery = {}) {
  // 요청이 들어온 뒤에만 실행(항상 최신 글을 보여 주기 위해)
  await connection();
  const supabase = await createClient();
  const limit = safeLimit(q.limit, 30, 300);

  let query = supabase.from("items").select(ITEM_COLUMNS);
  if (q.category) query = query.eq("category", q.category);
  if (q.region) query = query.eq("region", q.region);
  if (q.regions) query = query.in("region", q.regions);
  if (q.sellerId) query = query.eq("seller_id", q.sellerId);
  if (q.buyerId) query = query.eq("buyer_id", q.buyerId);
  if (q.status) query = query.eq("status", q.status);
  if (q.hideDone) query = query.neq("status", "거래완료");
  if (q.condition) query = query.eq("condition", q.condition);
  // 숨긴 글은 판매자·구매자·운영자에게도 일반 목록엔 안 섞이게 (숨김 표시 없이 섞이던 문제)
  if (!q.includeHidden) query = query.eq("is_hidden", false);
  if (q.minPrice != null) query = query.gte("price", q.minPrice);
  if (q.maxPrice != null) query = query.lte("price", q.maxPrice);

  // '*'는 검색 서버(PostgREST)가 '아무 글자'로 읽어서 전부 나오게 돼요 → 빼고 찾아요.
  const keyword = q.keyword?.replace(/\*/g, "").trim();
  if (keyword) {
    // ilike의 특수문자(%, _)를 글자 그대로 찾도록 앞에 \ 를 붙여요.
    const pattern = `%${keyword.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    const slugs = CATEGORIES.filter((c) => c.name.includes(keyword)).map((c) => c.slug);
    query = query.or(
      [`title.ilike.${quoted(pattern)}`, ...(slugs.length ? [`category.in.(${slugs.join(",")})`] : [])].join(","),
    );
  }

  const blocked = await getBlockedIds(q.hideBlocked);
  if (blocked.length) query = query.not("seller_id", "in", `(${blocked.join(",")})`);

  // 정렬: 최신(끌어올린 시각 기준) / 인기(♡ 많은 순) / 낮은 가격 / 높은 가격
  if (q.sort === "popular") query = query.order("like_count", { ascending: false }).order("bumped_at", { ascending: false });
  else if (q.sort === "low") query = query.order("price", { ascending: true }).order("bumped_at", { ascending: false });
  else if (q.sort === "high") query = query.order("price", { ascending: false }).order("bumped_at", { ascending: false });
  else query = query.order("bumped_at", { ascending: false });

  // 한 개 더 가져와 보면 '더 있는지' 알 수 있어요.
  const { data, error } = await query.limit(limit + 1);
  if (error) throw new Error("판매글을 불러오지 못했어요: " + error.message);
  const rows = (data ?? []) as Item[];
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

// 글 하나 (상세 화면, 수정 화면용). 없으면 null.
export async function getItem(id: string) {
  if (!/^\d+$/.test(id)) return null; // 주소에 숫자가 아닌 값이 오면 바로 '없음'
  await connection();
  const supabase = await createClient();

  const { data, error } = await supabase.from("items").select(ITEM_COLUMNS).eq("id", Number(id)).maybeSingle();
  if (error) throw new Error("판매글을 불러오지 못했어요: " + error.message);
  return data as Item | null;
}

// "몇 분 전" 계산에 쓸 지금 시각. 화면 그리는 도중 Date.now()를 직접 부르지 않으려고 따로 둬요.
export async function getRequestTime() {
  await connection(); // 요청이 들어온 뒤의 시각이어야 하니까요
  return Date.now();
}
