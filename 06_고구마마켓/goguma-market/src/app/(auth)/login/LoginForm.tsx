"use client";

import Link from "next/link";

import { useActionState } from "react";
import { login } from "@/app/auth/actions";
import FormMessage from "@/components/FormMessage";

export default function LoginForm({ next, notice }: { next: string; notice?: string }) {
  // useActionState: 서버 액션의 결과(에러 메시지 등)와 진행 중 여부를 받아옵니다.
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5">
        <span className="font-display">이메일</span>
        <input
          className="field"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="goguma@example.com"
          defaultValue={state?.fields?.email}
          required
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-display">비밀번호</span>
        <input className="field" type="password" name="password" autoComplete="current-password" required />
      </label>

      <FormMessage error={state?.error ?? notice} />

      <button type="submit" className="btn-goguma mt-2 w-full" disabled={pending}>
        {pending ? "밭으로 가는 중…" : "로그인"}
      </button>
      <Link href="/forgot" className="self-center text-xs text-soil-soft underline underline-offset-2 hover:text-skin">
        비밀번호를 잊으셨나요?
      </Link>
    </form>
  );
}
