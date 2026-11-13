"use client";
// 판매글 쓰기 / 고치기에 같이 쓰는 입력 폼
// 저장 버튼을 누르면: ① 새 사진을 Storage에 올리고 → ② 사진 경로와 글 내용을 Server Action으로 보내요.

import { startTransition, useActionState, useState } from "react";
import FormMessage from "@/components/FormMessage";
import PhotoPicker, { type PickedPhoto } from "@/components/PhotoPicker";
import { uploadPhoto } from "@/lib/photos";
import { CATEGORIES, CONDITIONS, photoUrl, STATUSES, TRADE_METHODS, type Item } from "@/lib/market";
import type { ItemFormState } from "@/app/items/actions";

type Props = {
  action: (prev: ItemFormState, formData: FormData) => Promise<ItemFormState>;
  item?: Item; // 있으면 '고치기' 화면
};

export default function ItemForm({ action, item }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  // 검사에 걸려 되돌아오면 방금 적은 값, 아니면 원래 글의 값을 보여 줘요.
  const v = state?.fields ?? {
    title: item?.title ?? "",
    category: item?.category ?? "",
    price: item ? String(item.price) : "",
    description: item?.description ?? "",
    status: item?.status ?? "판매중",
    condition: item?.condition ?? "사용감 있음",
    tradeMethod: item?.trade_method ?? "직거래",
  };

  // 사진 목록: 고치기 화면이면 이미 올라간 사진부터 채워 둬요.
  const [photos, setPhotos] = useState<PickedPhoto[]>(
    () => item?.photos.map((path) => ({ key: path, path, preview: photoUrl(path) })) ?? [],
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const busy = uploading || pending;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // 바로 보내지 않고, 사진부터 올려요.
    const formData = new FormData(e.currentTarget);
    setUploadError(undefined);
    setUploading(true);
    try {
      // 아직 안 올린 사진만 한꺼번에 올려요. 이미 올린 사진은 경로를 그대로 써요.
      const uploaded = await Promise.all(
        photos.map(async (p) => (p.path ? p : { ...p, path: await uploadPhoto(p.blob!) })),
      );
      // 저장에 실패해서 다시 누르더라도 같은 사진을 또 올리지 않게 기억해 둬요.
      setPhotos(uploaded);
      uploaded.forEach((p) => formData.append("photos", p.path!));
      // startTransition: useActionState의 액션을 직접 부를 때 꼭 감싸야 해요. (pending 표시도 이걸로 동작)
      startTransition(() => formAction(formData));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "사진을 올리지 못했어요.");
    } finally {
      setUploading(false);
    }
  }

  return (
    // key: 되돌아온 값이 바뀌면 입력칸을 새 값으로 다시 채우게 해요.
    <form key={JSON.stringify(v)} onSubmit={handleSubmit} className="flex flex-col gap-5">
      <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} />

      <label className="flex flex-col gap-1.5">
        <span className="font-display">제목</span>
        <input className="field" name="title" placeholder="예) 호박고구마 10kg 한 박스" minLength={2} maxLength={40} defaultValue={v.title} required />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-display">카테고리</span>
        <select className="field" name="category" defaultValue={v.category} required>
          <option value="" disabled>어떤 물건인가요?</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
      </label>

      {/* 상품 상태 · 거래 방법: 실제 중고거래에서 가장 많이 묻는 두 가지 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-display">상품 상태</span>
          <select className="field" name="condition" defaultValue={v.condition}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 font-display">거래 방법</legend>
          <div className="flex gap-2">
            {TRADE_METHODS.map((m) => (
              <label key={m} className="flex-1">
                <input type="radio" name="tradeMethod" value={m} defaultChecked={v.tradeMethod === m} className="peer sr-only" />
                <span className="block cursor-pointer rounded-xl border-2 border-soil/40 bg-[#fffaf0] py-2 text-center text-xs peer-checked:border-soil peer-checked:bg-skin peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-flesh/40">
                  {m}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-display">가격</span>
        <div className="relative">
          <input className="field w-full pr-10" name="price" inputMode="numeric" placeholder="0" defaultValue={v.price} required />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-soil-soft">원</span>
        </div>
        <span className="text-xs text-soil-soft">0원으로 적으면 &lsquo;나눔 🧡&rsquo;으로 올라가요.</span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="acceptOffers"
          defaultChecked={state?.fields ? state.fields.acceptOffers === "on" : (item?.accept_offers ?? false)}
          className="h-4 w-4 accent-[var(--color-skin)]"
        />
        💰 가격 제안 받기 <span className="text-xs text-soil-soft">(구매자가 채팅에서 원하는 가격을 제안할 수 있어요)</span>
      </label>

      {/* 판매 상태는 글을 올린 뒤 '고치기'에서만 바꿀 수 있어요 */}
      {item && (
        <fieldset className="flex flex-col gap-1.5">
          {/* 화면을 열 때의 상태: 그사이 거래 약속으로 상태가 바뀌었는지 서버가 비교해요 */}
          <input type="hidden" name="originalStatus" value={item.status} />
          <legend className="mb-1.5 font-display">판매 상태</legend>
          <div className="flex gap-2">
            {STATUSES.map((s) => (
              <label key={s} className="flex-1">
                <input type="radio" name="status" value={s} defaultChecked={v.status === s} className="peer sr-only" />
                <span className="block cursor-pointer rounded-xl border-2 border-soil/40 bg-[#fffaf0] py-2 text-center text-sm peer-checked:border-soil peer-checked:bg-skin peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-flesh/40">
                  {s}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="font-display">자세한 설명</span>
        <textarea
          className="field min-h-40 resize-y"
          name="description"
          maxLength={2000}
          placeholder="물건 상태, 산 시기, 거래 장소 등을 적어 주세요."
          defaultValue={v.description}
        />
      </label>

      <FormMessage error={uploadError ?? state?.error} />

      <button type="submit" className="btn-goguma w-full" disabled={busy}>
        {uploading ? "사진 올리는 중…" : pending ? "밭에 심는 중…" : item ? "고친 내용 저장하기" : "동네에 올리기"}
      </button>
    </form>
  );
}
