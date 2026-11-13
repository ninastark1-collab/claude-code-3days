import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeywordForm, RemoveKeywordButton } from "@/components/KeywordAndRegionForms";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "키워드 알림 · 고구마마켓" };

// 관심 키워드를 등록해 두면, 제목에 그 단어가 들어간 새 판매글이 올라올 때 🔔 알림이 와요.
export default function KeywordsPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Link href="/my" className="text-sm text-soil-soft hover:text-skin">← 나의 고구마</Link>
      <div className="card-sack mt-3 px-5 py-6 sm:px-8">
        <h1 className="font-display text-3xl">키워드 알림 🏷️</h1>
        <p className="mt-1 text-sm text-soil-soft">
          제목에 이 단어가 들어간 새 물건이 올라오면 🔔로 알려 드려요. (10개까지)
        </p>
        <div className="mt-5">
          <KeywordForm />
        </div>
        <Suspense fallback={<div className="mt-5 h-10 animate-pulse rounded-xl bg-hanji-deep" />}>
          <MyKeywords />
        </Suspense>
      </div>
    </div>
  );
}

async function MyKeywords() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/keywords");
  const supabase = await createClient();
  const { data } = await supabase
    .from("keyword_alerts")
    .select("keyword")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const keywords = (data ?? []).map((k) => k.keyword as string);

  if (keywords.length === 0) return <p className="mt-5 text-sm text-soil-soft">아직 등록한 키워드가 없어요.</p>;
  return (
    <ul className="mt-5 flex flex-wrap gap-2" aria-label="등록한 키워드">
      {keywords.map((k) => (
        <li key={k} className="flex items-center rounded-full border-2 border-soil bg-flesh-soft px-3 py-1 text-sm">
          🏷️ {k}
          <RemoveKeywordButton keyword={k} />
        </li>
      ))}
    </ul>
  );
}
