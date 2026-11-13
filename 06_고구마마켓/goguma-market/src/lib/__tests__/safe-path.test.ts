// 돌아갈 주소 검사 (바깥 사이트로 튕겨 나가는 주소를 막는지)
import { describe, expect, it } from "vitest";
import { isSafePath, safePath } from "@/lib/safe-path";

describe("isSafePath 우리 사이트 경로인지", () => {
  it("일반 경로는 통과", () => expect(isSafePath("/items/1?x=1")).toBe(true));
  it("'//다른사이트'는 막아요", () => expect(isSafePath("//evil.com")).toBe(false));
  // String.raw: 역슬래시(\)를 글자 그대로 쓰는 방법
  it("역슬래시로 시작하는 주소도 막아요", () => expect(isSafePath(String.raw`/\evil.com`)).toBe(false));
  it("http 주소는 막아요", () => expect(isSafePath("https://evil.com")).toBe(false));
});

describe("safePath 대신 갈 주소", () => {
  it("이상하면 기본값", () => expect(safePath("//evil.com", "/my")).toBe("/my"));
  it("비어 있으면 기본값", () => expect(safePath(undefined)).toBe("/"));
  it("괜찮으면 그대로", () => expect(safePath("/chat/3")).toBe("/chat/3"));
});
