"use client";
// ♡ 좋아요 버튼
// useOptimistic: 서버 응답을 기다리지 않고 누르는 즉시 하트·숫자를 먼저 바꿔 보여 줘요. (실패하면 원래대로 돌아가요)

import { startTransition, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { toggleLike } from "@/app/items/like-actions";

type Props = {
  itemId: number;
  liked: boolean;
  count: number;
  loggedIn: boolean;
  disabled?: boolean; // 내 글이면 누를 수 없고 숫자만 보여 줘요
};

export default function LikeButton({ itemId, liked, count, loggedIn, disabled }: Props) {
  const router = useRouter();
  const [state, setOptimistic] = useOptimistic({ liked, count }, (prev) => ({
    liked: !prev.liked,
    count: prev.count + (prev.liked ? -1 : 1),
  }));

  function onClick() {
    if (!loggedIn) {
      router.push(`/login?next=/items/${itemId}`);
      return;
    }
    startTransition(async () => {
      setOptimistic(null);
      await toggleLike(itemId);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={state.liked}
      aria-label={state.liked ? "좋아요 취소" : "좋아요"}
      title={disabled ? "내 글에는 좋아요를 누를 수 없어요" : undefined}
      className="flex shrink-0 flex-col items-center px-1 text-skin transition-transform enabled:active:scale-90 disabled:opacity-70"
    >
      <span className="text-3xl leading-none">{state.liked ? "♥" : "♡"}</span>
      <span className="mt-0.5 text-xs text-soil-soft">{state.count}</span>
    </button>
  );
}
