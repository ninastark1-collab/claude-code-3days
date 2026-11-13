import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteAccountForm, ProfileForm } from "@/components/AccountForms";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "내 정보 수정 · 고구마마켓" };

// 프로필 이모지·닉네임·내 동네 바꾸기 + 회원 탈퇴
export default function EditProfilePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Link href="/my" className="text-sm text-soil-soft hover:text-skin">← 나의 고구마</Link>
      <Suspense fallback={<div className="card-sack mt-3 h-96 animate-pulse" />}>
        <Forms />
      </Suspense>
    </div>
  );
}

async function Forms() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/edit");
  return (
    <>
      <div className="card-sack mt-3 px-5 py-6 sm:px-8">
        <h1 className="mb-5 font-display text-3xl">내 정보 수정 🍠</h1>
        <ProfileForm nickname={user.nickname} region={user.region} avatar={user.avatar} showOnline={user.showOnline} />
      </div>
      <details className="stitch mt-8 bg-[#fffaf0]/70 px-5 py-4">
        <summary className="cursor-pointer text-sm text-soil-soft">회원 탈퇴</summary>
        <div className="mt-4">
          <DeleteAccountForm />
        </div>
      </details>
    </>
  );
}
