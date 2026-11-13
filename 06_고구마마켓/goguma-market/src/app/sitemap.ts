// 검색엔진용 사이트 지도: 주요 화면 + 판매글 + 동네생활 글 주소 목록
// 'use cache': 매번 DB를 읽지 않고, 만들어 둔 목록을 1시간 동안 재사용해요.
import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { CATEGORIES } from "@/lib/market";

const SITE = "https://goguma-market-blond.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");

  // 로그인 정보 없이 '누구나 볼 수 있는 것'만 읽어요. (숨긴 글은 RLS 때문에 안 나와요)
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const [{ data: items }, { data: posts }] = await Promise.all([
    supabase.from("items").select("id, updated_at").order("bumped_at", { ascending: false }).limit(1000),
    supabase.from("community_posts").select("id, created_at").order("created_at", { ascending: false }).limit(500),
  ]);

  return [
    { url: `${SITE}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/community`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}/search`, priority: 0.5 },
    ...CATEGORIES.map((c) => ({ url: `${SITE}/category/${c.slug}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...(items ?? []).map((i) => ({ url: `${SITE}/items/${i.id}`, lastModified: i.updated_at, priority: 0.8 })),
    ...(posts ?? []).map((p) => ({ url: `${SITE}/community/${p.id}`, lastModified: p.created_at, priority: 0.5 })),
    { url: `${SITE}/terms`, priority: 0.2 },
    { url: `${SITE}/privacy`, priority: 0.2 },
  ];
}
