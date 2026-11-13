import type { Metadata } from "next";
import Link from "next/link";
import { PasswordForm } from "@/components/AccountForms";

export const metadata: Metadata = { title: "비밀번호 바꾸기 · 고구마마켓" };

// 로그인한 사람만 (proxy.ts가 /my 아래를 막아요). 비밀번호 찾기 메일 링크로 들어와도 이 화면이에요.
export default function PasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Link href="/my" className="text-sm text-soil-soft hover:text-skin">← 나의 고구마</Link>
      <div className="card-sack mt-3 px-5 py-6 sm:px-8">
        <h1 className="mb-5 font-display text-3xl">비밀번호 바꾸기 🔑</h1>
        <PasswordForm />
      </div>
    </div>
  );
}
