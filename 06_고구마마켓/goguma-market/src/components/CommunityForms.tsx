"use client";
// 동네생활: 글쓰기 폼, 댓글 폼, 지우기 버튼
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import FormMessage from "@/components/FormMessage";
import { addPostComment, createPost, deletePost, deletePostComment } from "@/app/community/actions";
import { TOPICS } from "@/lib/topics";

export function PostForm() {
  const [state, action, pending] = useActionState(createPost, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 font-display">주제</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <label key={t.value}>
              <input type="radio" name="topic" value={t.value} required defaultChecked={state?.fields?.topic === t.value} className="peer sr-only" />
              <span className="block cursor-pointer rounded-full border-2 border-soil/30 bg-[#fffaf0] px-3 py-1 text-sm peer-checked:border-soil peer-checked:bg-skin peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-flesh/40">
                {t.emoji} {t.value}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <textarea
        name="body"
        rows={8}
        minLength={2}
        maxLength={2000}
        required
        defaultValue={state?.fields?.body}
        placeholder="우리 동네 이웃과 나누고 싶은 이야기를 적어 주세요. (예: 가남읍 맛있는 칼국수집 추천해 주세요!)"
        className="field resize-y"
      />
      <FormMessage error={state?.error} />
      <button type="submit" className="btn-goguma" disabled={pending}>{pending ? "올리는 중…" : "동네에 이야기하기"}</button>
    </form>
  );
}

export function PostCommentForm({ postId, parentId }: { postId: number; parentId?: number }) {
  const [state, action, pending] = useActionState(addPostComment.bind(null, postId), undefined);
  return (
    // key: 성공할 때마다 폼을 새로 그려서 입력칸을 비워요.
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
          placeholder={parentId ? "답글을 남겨 주세요" : "따뜻한 댓글을 남겨 주세요"}
          aria-label={parentId ? "답글 입력" : "댓글 입력"}
          className={`field flex-1 resize-y py-2.5 ${parentId ? "min-h-11" : "min-h-16"}`}
        />
        <button type="submit" className="btn-goguma h-11 shrink-0 px-4! py-0! text-sm!" disabled={pending}>{pending ? "…" : "등록"}</button>
      </div>
      <FormMessage error={state?.error} />
    </form>
  );
}

function Pending({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending}>{pending ? "지우는 중…" : children}</button>;
}

export function DeletePostButton({ postId }: { postId: number }) {
  return (
    <form action={deletePost.bind(null, postId)} onSubmit={(e) => { if (!confirm("이 글을 지울까요? 댓글도 함께 지워져요.")) e.preventDefault(); }}>
      <Pending className="text-xs text-soil-soft underline underline-offset-2 hover:text-ember">글 삭제</Pending>
    </form>
  );
}

export function DeletePostCommentButton({ commentId, postId }: { commentId: number; postId: number }) {
  return (
    <form action={deletePostComment.bind(null, commentId, postId)} onSubmit={(e) => { if (!confirm("이 댓글을 지울까요?")) e.preventDefault(); }}>
      <Pending className="text-xs text-soil-soft underline underline-offset-2 hover:text-ember">삭제</Pending>
    </form>
  );
}
