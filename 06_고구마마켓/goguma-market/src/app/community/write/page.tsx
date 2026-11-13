import type { Metadata } from "next";
import Link from "next/link";
import { PostForm } from "@/components/CommunityForms";

export const metadata: Metadata = { title: "동네생활 글쓰기 · 고구마마켓" };

// 로그인한 사람만 (proxy.ts가 막아요). 글에는 내 동네가 함께 기록돼요.
export default function CommunityWritePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Link href="/community" className="text-sm text-soil-soft hover:text-skin">← 동네생활</Link>
      <div className="card-sack mt-3 px-5 py-6 sm:px-8">
        <h1 className="mb-5 font-display text-3xl">동네 이야기 쓰기 ✏️</h1>
        <PostForm />
      </div>
    </div>
  );
}
