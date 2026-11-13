// 검색엔진에게: 공개 화면은 둘러봐도 되고, 개인 화면(내 정보·채팅·운영자)은 빼 달라고 알려요.
import type { MetadataRoute } from "next";

const SITE = "https://goguma-market-blond.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/my", "/chat", "/notifications", "/admin", "/write", "/auth"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
