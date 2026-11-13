// 웹 앱 정보(PWA manifest): 휴대폰에서 '홈 화면에 추가'하면 앱처럼 아이콘·이름·색이 보여요.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "고구마마켓 — 우리 동네 구수한 중고거래",
    short_name: "고구마마켓",
    description: "흙 털고 건네는 우리 동네 중고거래",
    start_url: "/",
    display: "standalone", // 주소창 없이 앱처럼
    background_color: "#f6eedd",
    theme_color: "#8c3b5e",
    lang: "ko",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
