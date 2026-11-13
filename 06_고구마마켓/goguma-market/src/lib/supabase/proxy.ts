// 요청마다 로그인 세션(토큰)을 새로 고쳐서 쿠키에 다시 넣어 주는 함수
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 로그인해야만 들어갈 수 있는 경로
const PROTECTED = ["/my", "/chat", "/write", "/notifications", "/community/write", "/admin"];
// 로그인한 사람은 들어갈 필요 없는 경로
const GUEST_ONLY = ["/login", "/signup"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // 주의: createServerClient와 getClaims() 사이에 다른 코드를 넣지 마세요.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = !!data?.claims;
  const path = request.nextUrl.pathname;

  if (!isLoggedIn && PROTECTED.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && GUEST_ONLY.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
