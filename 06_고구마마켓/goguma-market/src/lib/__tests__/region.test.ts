// region.ts: 위치 → 동네 이름 테스트 (OpenStreetMap 주소 조각 예시로)
import { describe, expect, it } from "vitest";
import { isInKorea, regionFromAddress } from "@/lib/region";
import { topicEmoji, TOPICS } from "@/lib/topics";

describe("regionFromAddress 동네 이름 만들기", () => {
  it("읍·면: 시 + 읍", () => {
    expect(regionFromAddress({ province: "경기도", city: "여주시", town: "가남읍" })).toBe("여주시 가남읍");
  });
  it("서울: 시 + 구 + 동", () => {
    expect(regionFromAddress({ city: "서울특별시", borough: "마포구", quarter: "상암동" })).toBe("서울특별시 마포구 상암동");
  });
  it("군 지역의 리(마을)", () => {
    expect(regionFromAddress({ province: "강원특별자치도", county: "평창군", village: "대관령면" })).toBe("평창군 대관령면");
  });
  it("읍과 리가 같이 오면 읍을 써요", () => {
    expect(regionFromAddress({ city: "여주시", town: "가남읍", village: "태평리" })).toBe("여주시 가남읍");
  });
  it("서울의 통(neighbourhood)보다 동을 써요", () => {
    expect(regionFromAddress({ city: "서울특별시", borough: "마포구", suburb: "상암동", neighbourhood: "6통" })).toBe("서울특별시 마포구 상암동");
  });
  it("동네(읍·면·동)를 못 찾으면 null", () => {
    expect(regionFromAddress({ city: "여주시" })).toBeNull();
  });
});

describe("isInKorea 한국 좌표인지", () => {
  it("여주", () => expect(isInKorea(37.29, 127.63)).toBe(true));
  it("도쿄는 아니에요", () => expect(isInKorea(35.68, 139.69)).toBe(false));
});

describe("동네생활 주제", () => {
  it("주제마다 그림이 있어요", () => {
    for (const t of TOPICS) expect(topicEmoji(t.value)).toBe(t.emoji);
  });
  it("모르는 주제는 기본 그림", () => expect(topicEmoji("기타")).toBe("🌾"));
});
