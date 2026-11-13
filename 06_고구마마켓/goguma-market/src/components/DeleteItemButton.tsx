"use client";
// 판매글 삭제 버튼: 실수로 지우지 않게 한 번 더 물어봐요.
import { useFormStatus } from "react-dom";
import { deleteItem } from "@/app/items/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-straw w-full text-sm hover:bg-[#fbe4dc]!" disabled={pending}>
      {pending ? "지우는 중…" : "🗑️ 삭제"}
    </button>
  );
}

export default function DeleteItemButton({ id }: { id: number }) {
  return (
    <form
      className="flex-1"
      // bind: 어떤 글을 지울지(id)를 미리 넣어 둔 액션을 만들어요.
      action={deleteItem.bind(null, id)}
      onSubmit={(e) => {
        if (!confirm("이 글을 정말 지울까요? 지우면 되돌릴 수 없어요.")) e.preventDefault();
      }}
    >
      <SubmitButton />
    </form>
  );
}
