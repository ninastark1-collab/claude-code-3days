// 지금 로그인한 사용자와 프로필(닉네임, 동네)을 가져오는 함수
import { cache } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

// cache(): 한 번의 요청 안에서 여러 컴포넌트가 불러도 실제 조회는 한 번만 합니다.
// (헤더, 본문 등 여러 곳에서 부르기 때문에 이게 없으면 Supabase를 여러 번 왕복해요)
export const getCurrentUser = cache(async () => {
  // "이 함수는 요청이 들어온 뒤에만 실행된다"고 Next.js에 알려 줍니다.
  // (Supabase가 내부에서 Date.now()를 쓰기 때문에 미리 렌더링 대상에서 빼야 해요.)
  await connection();
  const supabase = await createClient();

  // getClaims(): 쿠키 속 토큰(JWT)을 서버에서 바로 검증합니다. getUser()처럼 매번 Supabase에 묻지 않아 빨라요.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;

  const [{ data: profile }, { data: admin }] = await Promise.all([
    supabase
    .from("profiles")
    .select("nickname, region, created_at, avatar, manner_temp, region_verified_at, show_online")
    .eq("id", claims.sub)
    .maybeSingle(),
    // 운영자인지 (RLS 덕분에 '내 줄'만 보여요)
    supabase.from("goguma_admins").select("user_id").eq("user_id", claims.sub).maybeSingle(),
  ]);

  const meta = (claims.user_metadata ?? {}) as { nickname?: string; region?: string };

  return {
    id: claims.sub,
    email: (claims.email as string | undefined) ?? "",
    nickname: profile?.nickname ?? meta.nickname ?? "고구마",
    region: profile?.region ?? meta.region ?? null,
    createdAt: profile?.created_at ?? null,
    avatar: profile?.avatar ?? "🍠",
    temp: Number(profile?.manner_temp ?? 36.5),
    regionVerified: !!profile?.region_verified_at, // 위치로 동네 인증했는지
    isAdmin: !!admin, // 운영자(신고 처리)
    showOnline: profile?.show_online ?? true, // 접속 상태 공개
  };
});
