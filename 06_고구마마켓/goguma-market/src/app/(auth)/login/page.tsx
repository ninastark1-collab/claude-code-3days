import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/AuthCard";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "로그인 · 고구마마켓" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard
      title="다시 오셨네요!"
      subtitle="고구마밭 문을 열어 드릴게요"
      footer={{ text: "아직 회원이 아니신가요?", href: "/signup", link: "회원가입" }}
    >
      <Suspense fallback={<div className="h-64" />}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

// searchParams(주소의 ?next=...)는 요청 때만 알 수 있으므로 Suspense 안에서 읽습니다.
async function LoginFormWithParams({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" ? next : "/";
  const notice = error === "confirm" ? "인증 링크가 만료되었거나 잘못됐어요. 다시 시도해 주세요." : undefined;

  return <LoginForm next={nextPath} notice={notice} />;
}
