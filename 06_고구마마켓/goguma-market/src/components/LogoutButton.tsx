"use client";
// 로그아웃 버튼: 누르는 즉시 "나가는 중…"으로 바뀌어 반응을 보여 줍니다.
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { currentSubscription } from "@/lib/push";
import { logout } from "@/app/auth/actions";

function SubmitButton({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "나가는 중…" : "로그아웃"}
    </button>
  );
}

export default function LogoutButton({ className = "btn-straw text-sm" }: { className?: string }) {
  // 이 기기의 푸시 구독 주소: 로그아웃할 때 함께 지워서, 다음에 이 기기를 쓰는 사람에게 내 알림이 가지 않게 해요.
  const [endpoint, setEndpoint] = useState("");
  useEffect(() => {
    currentSubscription().then((s) => setEndpoint(s?.endpoint ?? "")).catch(() => {});
  }, []);
  return (
    <form action={logout}>
      <input type="hidden" name="pushEndpoint" value={endpoint} />
      <SubmitButton className={className} />
    </form>
  );
}
