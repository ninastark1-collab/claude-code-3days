import type { Metadata } from "next";
import AuthCard from "@/components/AuthCard";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "회원가입 · 고구마마켓" };

export default function SignupPage() {
  return (
    <AuthCard
      title="고구마밭에 어서 와요"
      subtitle="이웃이 되어 구수한 거래를 시작해요"
      footer={{ text: "이미 회원이신가요?", href: "/login", link: "로그인" }}
    >
      <SignupForm />
    </AuthCard>
  );
}
