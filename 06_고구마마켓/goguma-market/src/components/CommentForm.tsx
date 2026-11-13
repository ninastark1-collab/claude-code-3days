"use client";
// 댓글 입력칸. 남기기에 성공하면 입력칸을 비워요.
// parentId가 있으면 '답글' 입력칸이에요. (ReplyToggle로 열고 닫아요)
import { useActionState, useState } from "react";
import FormMessage from "@/components/FormMessage";
import { addComment, type CommentState } from "@/app/items/comment-actions";

export default function CommentForm({ itemId, parentId }: { itemId: number; parentId?: number }) {
  const [state, action, pending] = useActionState<CommentState, FormData>(addComment.bind(null, itemId), undefined);

  return (
    // key: 성공할 때마다(ok 값이 바뀔 때) 폼을 새로 그려서 입력칸을 비워요.
    <form key={state?.ok ?? "form"} action={action} className="flex flex-col gap-2">
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <div className="flex items-end gap-2">
        <textarea
          name="body"
          defaultValue={state?.body} // 실패하면 적던 내용을 그대로 돌려놔요
          rows={parentId ? 1 : 2}
          maxLength={500}
          required
          autoFocus={!!parentId}
          placeholder={parentId ? "답글을 남겨 주세요" : "궁금한 점을 댓글로 물어보세요. (모두에게 보여요)"}
          aria-label={parentId ? "답글 입력" : "댓글 입력"}
          className={`field flex-1 resize-y py-2.5 ${parentId ? "min-h-11" : "min-h-16"}`}
        />
        <button type="submit" className="btn-goguma h-11 shrink-0 px-4! py-0! text-sm!" disabled={pending}>
          {pending ? "…" : "등록"}
        </button>
      </div>
      <FormMessage error={state?.error} />
    </form>
  );
}

// '답글 달기' 버튼 → 누르면 답글 입력칸이 열려요. (children: 열렸을 때 보여 줄 입력칸)
export function ReplyToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <div className="mt-2 flex flex-col gap-1">
      {children}
      <button type="button" onClick={() => setOpen(false)} className="self-start text-xs text-soil-soft hover:text-skin">
        닫기
      </button>
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs text-soil-soft hover:text-skin">
      ↳ 답글 달기
    </button>
  );
}
