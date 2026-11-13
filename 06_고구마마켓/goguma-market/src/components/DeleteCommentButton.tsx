"use client";
// 댓글 지우기 버튼: 실수로 지우지 않게 한 번 더 물어봐요.
import { useFormStatus } from "react-dom";
import { deleteComment } from "@/app/items/comment-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="text-xs text-soil-soft underline underline-offset-2 hover:text-ember" disabled={pending}>
      {pending ? "지우는 중…" : "삭제"}
    </button>
  );
}

export default function DeleteCommentButton({ commentId, itemId }: { commentId: number; itemId: number }) {
  return (
    <form
      action={deleteComment.bind(null, commentId, itemId)}
      onSubmit={(e) => {
        if (!confirm("이 댓글을 지울까요?")) e.preventDefault();
      }}
    >
      <SubmitButton />
    </form>
  );
}
