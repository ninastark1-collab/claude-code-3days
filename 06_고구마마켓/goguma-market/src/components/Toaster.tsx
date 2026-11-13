"use client";
// 작업이 끝난 뒤 화면 아래에 잠깐 떴다 사라지는 안내(토스트)
// Server Action이 끝나고 주소 뒤에 ?toast=saved 처럼 붙여 보내면, 여기서 그 이름에 맞는 문장을 보여 줘요.
// 보여 준 다음엔 주소에서 toast를 지워서, 새로고침해도 다시 뜨지 않게 해요.

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const MESSAGES: Record<string, string> = {
  created: "🌱 물건을 동네에 올렸어요!",
  updated: "✏️ 고친 내용을 저장했어요.",
  deleted: "🗑️ 글을 지웠어요.",
  bumped: "⬆️ 끌어올렸어요! 목록 맨 위로 올라갔어요.",
  sold: "🤝 거래완료로 바꿨어요. 후기를 남겨 보세요!",
  reviewed: "💌 후기를 보냈어요. 고마워요!",
  profile: "🍠 내 정보를 저장했어요.",
  reported: "🚨 신고를 접수했어요. 확인 후 조치할게요.",
  blocked: "🚫 차단했어요. 이제 이 사용자의 글과 채팅이 보이지 않아요.",
  unblocked: "차단을 풀었어요.",
  reserved_delete: "예약중인 글은 지울 수 없어요. 채팅방에서 약속을 취소하거나 판매 상태를 바꾼 뒤 지워 주세요.",
  chat_blocked: "🚫 차단된 사이라서 채팅을 시작할 수 없어요.",
  left: "👋 채팅방에서 나왔어요.",
  posted: "🌾 동네생활에 글을 올렸어요!",
  password: "🔑 비밀번호를 바꿨어요.",
  resetsent: "📮 비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요.",
  goodbye: "👋 탈퇴했어요. 그동안 고마웠어요!",
  region: "📍 동네 인증을 마쳤어요!",
  handled: "✅ 신고를 처리했어요.",
  hidden: "🙈 글을 숨겼어요.",
  shown: "👀 글을 다시 보이게 했어요.",
};

export default function Toaster() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = params.get("toast");
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    // 바로 setState 하지 않고 다음 순간에 보여 줘요. (effect 안에서 곧바로 상태를 바꾸면 화면을 두 번 그리게 돼요)
    const showTimer = setTimeout(() => setShown(MESSAGES[key] ?? null), 0);
    // 주소에서 toast만 지워요 (다른 값은 그대로)
    const rest = new URLSearchParams(params.toString());
    rest.delete("toast");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    const timer = setTimeout(() => setShown(null), 3200);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(timer);
    };
  }, [key, params, pathname, router]);

  if (!shown) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8"
    >
      <p className="animate-[toast_3.2s_ease-in-out_forwards] rounded-full border-2 border-soil bg-soil px-5 py-2.5 text-sm text-hanji shadow-[3px_4px_0_var(--color-skin)]">
        {shown}
      </p>
    </div>
  );
}
