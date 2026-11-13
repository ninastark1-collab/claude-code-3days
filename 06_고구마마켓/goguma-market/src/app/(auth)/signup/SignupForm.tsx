"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/app/auth/actions";
import FormMessage from "@/components/FormMessage";

export default function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);

  // 인증 메일을 보냈으면 폼 대신 안내만 보여 줍니다.
  if (state?.message) {
    return (
      <div className="flex flex-col gap-5 text-center">
        <div className="text-5xl">📮</div>
        <FormMessage message={state.message} />
        <p className="text-sm text-soil-soft">메일이 안 보이면 스팸함도 살펴봐 주세요.</p>
        <Link href="/login" className="btn-straw self-center">로그인 하러 가기</Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-display">닉네임</span>
        <input
          className="field"
          name="nickname"
          placeholder="예) 호박고구마"
          minLength={2}
          maxLength={12}
          defaultValue={state?.fields?.nickname}
          required
        />
        <span className="text-xs text-soil-soft">2~12자, 이웃에게 보여지는 이름이에요.</span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-display">
          우리 동네 <span className="text-xs text-soil-soft">(선택)</span>
        </span>
        <input className="field" name="region" placeholder="예) 여주시 가남읍" defaultValue={state?.fields?.region} />
      </label>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-display">비밀번호</span>
          <input
            className="field"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={6}
            placeholder="6자 이상"
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-display">비밀번호 확인</span>
          <input className="field" type="password" name="passwordConfirm" autoComplete="new-password" minLength={6} required />
        </label>
      </div>

      {/* 약관 동의: 꼭 체크해야 가입돼요 (서버에서도 한 번 더 확인) */}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" required className="mt-1 h-4 w-4 accent-[var(--color-skin)]" />
        <span>
          <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-skin">이용약관</Link>과{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-skin">개인정보처리방침</Link>을 읽고 동의해요. (필수)
        </span>
      </label>

      <FormMessage error={state?.error} />

      <button type="submit" className="btn-goguma mt-2 w-full" disabled={pending}>
        {pending ? "씨고구마 심는 중…" : "가입하고 밭 구경하기"}
      </button>
    </form>
  );
}
