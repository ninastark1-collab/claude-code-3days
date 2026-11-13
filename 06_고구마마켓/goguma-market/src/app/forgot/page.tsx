import type { Metadata } from "next";
import AuthCard from "@/components/AuthCard";
import { ForgotForm } from "@/components/AccountForms";

export const metadata: Metadata = { title: "비밀번호 찾기 · 고구마마켓" };

// 비밀번호를 잊었을 때: 메일로 재설정 링크를 받아요.
export default function ForgotPage() {
  return (
    <AuthCard
      title="비밀번호를 잊으셨나요?"
      subtitle="가입한 이메일로 재설정 링크를 보내 드릴게요"
      footer={{ text: "비밀번호가 기억났나요?", href: "/login", link: "로그인" }}
    >
      <ForgotForm />
    </AuthCard>
  );
}
