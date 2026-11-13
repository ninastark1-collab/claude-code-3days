// market.ts의 화면용 계산 함수 테스트
import { describe, expect, it } from "vitest";
import { distanceKm, formatPrice, friendlyDbError, getCategory, safeLimit, tempLook, timeAgo } from "@/lib/market";

describe("formatPrice 가격 표시", () => {
  it("0원은 나눔으로 보여요", () => {
    expect(formatPrice(0)).toBe("나눔 🧡");
  });
  it("천 단위마다 쉼표를 찍어요", () => {
    expect(formatPrice(65000000)).toBe("65,000,000원");
    expect(formatPrice(1500)).toBe("1,500원");
  });
});

describe("timeAgo 올린 시간", () => {
  const now = new Date("2026-11-11T12:00:00Z").getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it("1분 안이면 '방금 전'", () => expect(timeAgo(ago(30_000), now)).toBe("방금 전"));
  it("분 단위", () => expect(timeAgo(ago(5 * 60_000), now)).toBe("5분 전"));
  it("시간 단위", () => expect(timeAgo(ago(3 * 3600_000), now)).toBe("3시간 전"));
  it("하루 전은 '어제'", () => expect(timeAgo(ago(26 * 3600_000), now)).toBe("어제"));
  it("며칠 전", () => expect(timeAgo(ago(4 * 86400_000), now)).toBe("4일 전"));
  it("미래 시각(시계 차이)이어도 '방금 전'", () => expect(timeAgo(ago(-60_000), now)).toBe("방금 전"));
});

describe("tempLook 고구마 온도 모양", () => {
  it("처음 온도 36.5℃는 새싹", () => expect(tempLook(36.5).emoji).toBe("🌱"));
  it("낮아지면 추운 얼굴", () => expect(tempLook(30).emoji).toBe("🥶"));
  it("아주 높으면 불꽃", () => expect(tempLook(55).emoji).toBe("🔥"));
});

describe("friendlyDbError DB 오류를 한국어로", () => {
  it("도배 방지", () => expect(friendlyDbError("rate_limited")).toContain("너무 빨리"));
  it("끌어올리기 하루 한 번", () => expect(friendlyDbError("bump_too_soon")).toContain("하루에 한 번"));
  it("권한(RLS) 오류", () => expect(friendlyDbError("new row violates row-level security policy")).toContain("권한"));
  it("차단된 사이 댓글", () => expect(friendlyDbError("blocked_pair")).toContain("차단"));
  it("동시에 처리(교착)", () => expect(friendlyDbError("deadlock detected")).toContain("다시"));
});

describe("getCategory 카테고리 찾기", () => {
  it("있는 카테고리", () => expect(getCategory("food")?.name).toBe("농산물/가공식품"));
  it("없는 카테고리", () => expect(getCategory("nope")).toBeUndefined());
});

describe("safeLimit 주소의 개수 값 정리", () => {
  it("정상 숫자", () => expect(safeLimit("40", 20, 300)).toBe(40));
  it("소수는 버림", () => expect(safeLimit("2.5", 20, 300)).toBe(2));
  it("음수·0·글자는 기본값", () => {
    expect(safeLimit("-5", 20, 300)).toBe(20);
    expect(safeLimit("0", 20, 300)).toBe(20);
    expect(safeLimit("abc", 20, 300)).toBe(20);
    expect(safeLimit(undefined, 20, 300)).toBe(20);
  });
  it("최대값을 넘지 않아요", () => expect(safeLimit("9999", 20, 300)).toBe(300));
});

describe("distanceKm 두 동네 사이 거리", () => {
  const 가남읍 = { lat: 37.2030833, lng: 127.5465246 };
  it("같은 곳은 0km", () => expect(distanceKm(가남읍, 가남읍)).toBe(0));
  it("가남읍 ↔ 점동면 약 10km", () => expect(distanceKm(가남읍, { lat: 37.2064694, lng: 127.6623799 })).toBeCloseTo(10.3, 0));
  it("서울시청 ↔ 부산시청 약 325km", () =>
    expect(distanceKm({ lat: 37.5663, lng: 126.9779 }, { lat: 35.1798, lng: 129.075 })).toBeGreaterThan(310));
});
