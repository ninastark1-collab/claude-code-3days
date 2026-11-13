// 고구마마켓 카테고리, 판매글 모양(타입), 화면용 도우미 함수
// (DB에서 판매글을 불러오는 함수는 src/lib/items.ts에 있어요)

// tint: 사진이 아직 없어서, 카드 썸네일 자리에 카테고리 그림 + 배경색을 보여 줘요.
export type Category = { slug: string; name: string; emoji: string; tint: string };

export const CATEGORIES: Category[] = [
  { slug: "digital", name: "디지털기기", emoji: "📱", tint: "#e3e8f2" },
  { slug: "appliance", name: "생활가전", emoji: "🔌", tint: "#dbe9ee" },
  { slug: "furniture", name: "가구/인테리어", emoji: "🪑", tint: "#ecd9c0" },
  { slug: "kitchen", name: "생활/주방", emoji: "🍳", tint: "#e6e1da" },
  { slug: "kids", name: "유아동", emoji: "🧸", tint: "#f6dfe6" },
  { slug: "clothes", name: "의류", emoji: "👕", tint: "#e0e3ee" },
  { slug: "goods", name: "잡화", emoji: "👜", tint: "#efe2d2" },
  { slug: "beauty", name: "뷰티/미용", emoji: "💄", tint: "#f6dfe6" },
  { slug: "sports", name: "스포츠/레저", emoji: "⚽", tint: "#dfe8d3" },
  { slug: "hobby", name: "취미/게임/음반", emoji: "🎮", tint: "#f1dcdc" },
  { slug: "books", name: "도서", emoji: "📚", tint: "#f3e6cc" },
  { slug: "tickets", name: "티켓/교환권", emoji: "🎟️", tint: "#fbe2b4" },
  { slug: "food", name: "농산물/가공식품", emoji: "🍠", tint: "#fbe2b4" },
  { slug: "pets", name: "반려동물용품", emoji: "🐶", tint: "#efe2d2" },
  { slug: "plants", name: "식물", emoji: "🪴", tint: "#dbead2" },
  { slug: "etc", name: "기타 중고물품", emoji: "📦", tint: "#ede0c6" },
];

export function getCategory(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug);
}

// 상품 상태·거래 방법 (DB의 check 규칙과 같은 값)
export const CONDITIONS = ["새상품", "거의 새것", "사용감 있음", "고장·부품용"] as const;
export type ItemCondition = (typeof CONDITIONS)[number];
export const TRADE_METHODS = ["직거래", "택배", "직거래·택배"] as const;
export type TradeMethod = (typeof TRADE_METHODS)[number];

// 판매 상태 (DB의 status 칸에 들어가는 값과 같아요)
export const STATUSES = ["판매중", "예약중", "거래완료"] as const;
export type ItemStatus = (typeof STATUSES)[number];

// DB items 테이블 한 줄 + 판매자 닉네임
export type Item = {
  id: number;
  seller_id: string;
  title: string;
  description: string;
  price: number; // 0 = 나눔
  category: string;
  region: string | null;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
  photos: string[]; // Storage 안의 사진 경로 목록 (첫 번째가 대표 사진)
  like_count: number; // ♡ 좋아요 수 (DB 트리거가 자동으로 세요)
  chat_count: number; // 💬 이 글로 열린 채팅방 수
  buyer_id: string | null; // 거래완료 때 고른 구매자
  bumped_at: string; // 끌어올린 시각 (목록은 이 순서)
  accept_offers: boolean; // 가격 제안 받기
  is_hidden: boolean; // 운영자가 숨긴 글 (판매자·운영자만 보여요)
  condition: ItemCondition; // 상품 상태
  trade_method: TradeMethod; // 거래 방법
  view_count: number; // 조회수 (하루에 한 사람당 1번)
  seller: { nickname: string; avatar: string; manner_temp: number; region_verified_at?: string | null; last_seen_at?: string | null } | null;
};

// 프로필에 고를 수 있는 이모지 (구황작물·향토 느낌)
export const AVATARS = ["🍠", "🥔", "🌽", "🌰", "🎃", "🥕", "🍄", "🌾", "🐿️", "🐓", "🐄", "🐝"];

// 동네 이름 예시 (입력칸에서 골라 쓸 수 있게 보여 줘요. 직접 적어도 돼요)
export const REGION_SUGGESTIONS = [
  "여주시 여주동", "여주시 오학동", "여주시 중앙동", "여주시 가남읍", "여주시 점동면", "여주시 능서면",
  "여주시 북내면", "여주시 강천면", "여주시 대신면", "여주시 금사면", "여주시 산북면", "여주시 흥천면",
];

// 고구마 온도에 어울리는 그림과 색 (당근의 매너온도처럼, 높을수록 따뜻해요)
export function tempLook(temp: number) {
  if (temp >= 50) return { emoji: "🔥", color: "#c4502f" };
  if (temp >= 40) return { emoji: "🍠", color: "#f2a93b" };
  if (temp >= 36.5) return { emoji: "🌱", color: "#5e7d3a" };
  return { emoji: "🥶", color: "#5a7aa0" };
}

// 후기 평가 이름
export const RATINGS = {
  good: { label: "최고예요", emoji: "😍" },
  soso: { label: "괜찮아요", emoji: "🙂" },
  bad: { label: "별로예요", emoji: "😞" },
} as const;
export type Rating = keyof typeof RATINGS;

// 신고 사유 (DB의 reason 칸에 들어가는 값과 같아요)
export const REPORT_REASONS = ["사기 의심", "판매 금지 물품", "욕설·비방", "스팸·광고", "기타"] as const;

// DB 오류 문장을 사용자에게 보여 줄 한국어로 바꿔요.
// 홈 '내 동네' 범위: 우리 동네만 / 근처 / 넓게
// (시골은 읍·면 하나가 넓어서 12km는 되어야 옆 동네가 잡혀요)
export const AREA_RANGES = [
  { value: "near", label: "근처 동네", km: 12 },
  { value: "wide", label: "넓게", km: 25 },
] as const;

// 두 지점 사이 거리(km) — 지구를 공으로 보고 계산하는 하버사인 공식
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// 주소의 n 같은 '몇 개' 값을 안전한 정수로 (1.5, -5, 글자 → 기본값/범위 안으로)
export function safeLimit(value: unknown, fallback: number, max: number) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
}

export function friendlyDbError(message: string) {
  if (message.includes("rate_limited")) return "너무 빨리 여러 번 보냈어요. 잠시 후 다시 시도해 주세요.";
  if (message.includes("bump_too_soon")) return "끌어올리기는 하루에 한 번만 할 수 있어요.";
  if (message.includes("admin_only")) return "운영자만 할 수 있는 일이에요.";
  if (message.includes("bad_parent")) return "답글을 달 수 없는 댓글이에요. (답글에는 답글을 달 수 없어요)";
  if (message.includes("item_not_available")) return "이미 다른 분과 약속이 잡혔거나 판매가 끝난 물건이에요.";
  if (message.includes("bad_deal_step")) return "지금 단계에서는 할 수 없는 동작이에요. 화면을 새로 고쳐 주세요.";
  if (message.includes("deals_one_open_per_room")) return "이 대화방에는 이미 진행 중인 거래 약속이 있어요.";
  if (message.includes("blocked_pair")) return "차단된 사이라서 댓글을 남길 수 없어요.";
  // 두 사람이 같은 순간 같은 물건을 처리하면 DB가 한쪽을 멈춰요. 다시 하면 돼요.
  if (message.includes("deadlock")) return "같은 순간에 다른 처리가 있었어요. 잠시 뒤 다시 해 주세요.";
  if (message.includes("row-level security")) return "권한이 없어요. 차단된 사이이거나 내 글이 아닐 수 있어요.";
  return "문제가 생겼어요: " + message;
}

// 사진 설정: 저장 공간(버킷) 이름과 한 글에 올릴 수 있는 최대 장수
export const PHOTO_BUCKET = "goguma-item-photos";
export const MAX_PHOTOS = 10;

// 사진 경로("사용자id/파일.jpg") → 누구나 볼 수 있는 사진 주소
export function photoUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

export function formatPrice(price: number) {
  return price === 0 ? "나눔 🧡" : `${price.toLocaleString("ko-KR")}원`;
}

// "3분 전", "어제" 처럼 올린 시간을 사람이 읽기 쉽게 바꿔 줘요.
export function timeAgo(iso: string, now: number) {
  const sec = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "방금 전";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day === 1) return "어제";
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}
