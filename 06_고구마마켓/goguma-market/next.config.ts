import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 판매글 사진은 Supabase Storage에 있어요. <Image>가 그 주소의 사진만 줄여서 보여 줄 수 있게 허락해요.
  images: {
    remotePatterns: [new URL("https://gfcylhusujdvzsoinwoj.supabase.co/storage/v1/object/public/goguma-item-photos/**")],
  },
  // 개발 중(npm run dev)에만 쓰는 설정: 127.0.0.1 주소로도 미리보기를 열 수 있게 허락해요.
  // (localhost와 127.0.0.1은 로그인 쿠키가 따로라서, 판매자·구매자 두 계정으로 채팅을 동시에 시험할 때 써요)
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
