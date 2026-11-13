"use server";
// 회원가입 / 로그인 / 로그아웃을 처리하는 Server Actions
// <form action={...}> 에서 바로 호출되며, 서버에서만 실행됩니다.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rememberRegion } from "@/lib/geo";

export type AuthState = {
  error?: string;
  message?: string;
  fields?: Record<string, string>;
} | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Supabase 영어 에러 메시지를 한국어로 바꿔 줍니다.
function toKorean(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "이메일 또는 비밀번호가 맞지 않아요.";
  if (m.includes("email not confirmed")) return "메일함에서 인증 링크를 먼저 눌러 주세요.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (m.includes("rate limit")) return "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.";
  if (m.includes("password")) return "비밀번호 조건을 확인해 주세요. (6자 이상)";
  return "문제가 생겼어요: " + message;
}

// 로그인 후 돌아갈 주소. 외부 주소로 튕겨 나가지 않도록 '/'로 시작하는 경로만 허용합니다.
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const nickname = String(formData.get("nickname") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const fields = { email, nickname, region };

  if (nickname.length < 2 || nickname.length > 12)
    return { error: "닉네임은 2~12자로 지어 주세요.", fields };
  if (!EMAIL_RE.test(email)) return { error: "이메일 형식을 확인해 주세요.", fields };
  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 해요.", fields };
  if (password !== passwordConfirm) return { error: "비밀번호가 서로 달라요.", fields };
  if (formData.get("agree") !== "on") return { error: "이용약관과 개인정보처리방침에 동의해 주세요.", fields };

  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // user_metadata 로 저장 → DB 트리거가 profiles 테이블에 옮겨 담습니다.
      data: { nickname, region },
      // 이메일 인증 링크를 누르면 돌아올 주소
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) return { error: toKorean(error.message), fields };

  // 이미 가입된 이메일이면 Supabase는 보안상 에러 대신 identities가 빈 user를 돌려줍니다.
  if (data.user && data.user.identities?.length === 0)
    return { error: "이미 가입된 이메일이에요. 로그인해 주세요.", fields };

  // 이메일 인증이 꺼져 있으면 바로 세션이 생기므로 홈으로 보냅니다.
  if (data.session) {
    // 가입하며 적은 동네도 위치표에 (근처 동네 보기용)
    await rememberRegion(region);
    revalidatePath("/", "layout");
    redirect("/?welcome=1");
  }

  return {
    message: `${email} 로 인증 메일을 보냈어요. 메일의 링크를 누르면 가입이 끝나요!`,
  };
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요.", fields: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: toKorean(error.message), fields: { email } };

  revalidatePath("/", "layout");
  redirect(next);
}

export async function logout(formData?: FormData) {
  const supabase = await createClient();
  // 이 기기의 푸시 구독을 먼저 지워요. (로그아웃한 뒤에도 내 알림이 이 기기에 오지 않게)
  const endpoint = String(formData?.get("pushEndpoint") ?? "");
  if (endpoint) await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  // scope: "local" → 이 기기에서만 로그아웃. 쿠키를 먼저 지우고 나서 서버에 알립니다.
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/");
}
