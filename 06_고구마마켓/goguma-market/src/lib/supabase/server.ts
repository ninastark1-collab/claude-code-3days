// 서버(Server Component, Server Action, Route Handler)에서 쓰는 Supabase 클라이언트
// 로그인 세션은 쿠키에 저장되므로, Next.js의 cookies()로 읽고 씁니다.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component에서는 쿠키를 쓸 수 없어서 에러가 납니다.
            // 세션 갱신은 proxy.ts가 맡고 있으므로 무시해도 됩니다.
          }
        },
      },
    },
  );
}
