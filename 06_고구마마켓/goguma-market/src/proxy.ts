// Next.js 16부터 middleware.ts → proxy.ts 로 이름이 바뀌었습니다.
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // 정적 파일과 이미지는 건너뜁니다.
  matcher: [
    // sw.js(서비스 워커)는 로그인 확인이 필요 없어서 빼요
    "/((?!_next/static|_next/image|favicon.ico|sw\.js|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
