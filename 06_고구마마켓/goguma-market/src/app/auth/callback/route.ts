// 이메일 인증 링크를 누르면 이 주소로 돌아옵니다.
// URL의 code를 세션(로그인 상태)으로 바꿔 쿠키에 저장합니다.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // 돌아갈 곳(비밀번호 찾기면 /my/password). 바깥 주소로 튕겨 나가지 않게 '/'로 시작하는 경로만 허용해요.
  const nextParam = searchParams.get("next") ?? "";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/?welcome=1";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=confirm`);
}
