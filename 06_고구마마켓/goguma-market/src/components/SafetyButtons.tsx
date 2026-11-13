"use client";
// 신고하기 / 차단하기 버튼
// 신고: 누르면 사유를 고르는 작은 창(<dialog>)이 열려요.
// 차단: 한 번 더 물어본 뒤 차단해요.

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import FormMessage from "@/components/FormMessage";
import { blockUser, submitReport, unblockUser } from "@/app/safety/actions";
import { REPORT_REASONS } from "@/lib/market";

type ReportProps = {
  targetType: "item" | "user" | "comment" | "chat" | "post";
  targetId: string | number;
  back: string; // 신고 후 돌아갈 주소
  label?: string;
  className?: string;
};

export function ReportButton({ targetType, targetId, back, label = "🚨 신고", className }: ReportProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(submitReport, undefined);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={className ?? "text-xs text-soil-soft underline underline-offset-2 hover:text-ember"}
      >
        {label}
      </button>
      {/* <dialog>: 브라우저가 기본으로 주는 팝업 창. 바깥 화면은 잠시 못 누르게 돼요. */}
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(92vw,26rem)] rounded-2xl border-2 border-soil bg-hanji p-0 text-soil shadow-[5px_6px_0_var(--color-soil)] backdrop:bg-soil/50"
      >
        <form action={action} className="flex flex-col gap-3 p-5">
          <h2 className="font-display text-xl">신고하기 🚨</h2>
          <p className="text-xs text-soil-soft">신고 내용은 운영자만 볼 수 있어요. 상대에게 알려지지 않아요.</p>
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={String(targetId)} />
          <input type="hidden" name="back" value={back} />
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 font-display text-sm">사유</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="radio" name="reason" value={r} required className="accent-[var(--color-skin)]" />
                {r}
              </label>
            ))}
          </fieldset>
          <textarea name="detail" maxLength={500} rows={3} placeholder="자세한 내용 (선택)" className="field resize-none" />
          <FormMessage error={state?.error} />
          <div className="flex gap-2">
            <button type="submit" className="btn-goguma flex-1 px-4! py-2! text-sm!" disabled={pending}>
              {pending ? "보내는 중…" : "신고하기"}
            </button>
            <button type="button" onClick={() => dialogRef.current?.close()} className="btn-straw text-sm">
              닫기
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function PendingButton({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "처리 중…" : children}
    </button>
  );
}

export function BlockButton({
  otherId,
  nickname,
  back,
  blocked,
  className = "text-xs text-soil-soft underline underline-offset-2 hover:text-ember",
}: {
  otherId: string;
  nickname: string;
  back: string;
  blocked: boolean;
  className?: string;
}) {
  if (blocked)
    return (
      <form action={unblockUser.bind(null, otherId, back)}>
        <PendingButton className={className}>차단 풀기</PendingButton>
      </form>
    );
  return (
    <form
      action={blockUser.bind(null, otherId, back)}
      onSubmit={(e) => {
        if (!confirm(`${nickname}님을 차단할까요?\n서로 채팅을 할 수 없고, ${nickname}님의 글과 댓글이 보이지 않아요.`)) e.preventDefault();
      }}
    >
      <PendingButton className={className}>🚫 차단</PendingButton>
    </form>
  );
}
