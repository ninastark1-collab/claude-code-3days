"use client";
// 거래 관련 작은 폼: 끌어올리기 버튼, 거래 후기 남기기
import { useActionState } from "react";
import FormMessage from "@/components/FormMessage";
import { bumpItem, submitReview } from "@/app/items/trade-actions";
import { RATINGS, type Rating } from "@/lib/market";

// 끌어올리기 (하루 한 번). canBump가 false면 남은 시간을 알려 줘요.
export function BumpButton({ itemId, waitText }: { itemId: number; waitText?: string }) {
  const [state, action, pending] = useActionState(bumpItem.bind(null, itemId), undefined);
  return (
    <form action={action} className="flex flex-1 flex-col">
      <button type="submit" className="btn-straw w-full text-sm" disabled={pending || !!waitText} title={waitText}>
        {pending ? "올리는 중…" : waitText ? `⬆️ ${waitText}` : "⬆️ 끌어올리기"}
      </button>
      {state?.error && <span className="mt-1 text-center text-xs text-ember">{state.error}</span>}
    </form>
  );
}

// 거래 후기: 최고예요 / 괜찮아요 / 별로예요 + 한마디
export function ReviewForm({ itemId, revieweeId, revieweeName }: { itemId: number; revieweeId: string; revieweeName: string }) {
  const [state, action, pending] = useActionState(submitReview.bind(null, itemId, revieweeId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="font-display">{revieweeName}님과의 거래, 어땠나요?</p>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(RATINGS) as Rating[]).map((r) => (
          <label key={r}>
            <input type="radio" name="rating" value={r} required className="peer sr-only" />
            <span className="flex cursor-pointer flex-col items-center gap-0.5 rounded-xl border-2 border-soil/40 bg-[#fffaf0] py-2 text-sm peer-checked:border-soil peer-checked:bg-flesh-soft peer-focus-visible:ring-4 peer-focus-visible:ring-flesh/40">
              <span className="text-2xl">{RATINGS[r].emoji}</span>
              {RATINGS[r].label}
            </span>
          </label>
        ))}
      </div>
      <textarea name="body" maxLength={300} rows={2} placeholder="따뜻한 한마디를 남겨 주세요 (선택)" className="field resize-none" />
      <FormMessage error={state?.error} />
      <button type="submit" className="btn-goguma px-4! py-2! text-sm!" disabled={pending}>
        {pending ? "보내는 중…" : "후기 보내기"}
      </button>
    </form>
  );
}
