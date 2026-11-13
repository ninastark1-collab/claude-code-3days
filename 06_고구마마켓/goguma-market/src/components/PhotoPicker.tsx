"use client";
// 판매글 사진 고르기 (최대 10장) — 미리보기, 빼기, 대표 사진 바꾸기
// 실제 업로드는 저장 버튼을 누를 때 ItemForm이 해요. 여기는 '고르기'만 담당해요.

import { useRef, useState } from "react";
import { compressImage } from "@/lib/photos";
import { MAX_PHOTOS } from "@/lib/market";

// path가 있으면 이미 Storage에 올라간 사진, blob만 있으면 아직 안 올린 새 사진이에요.
export type PickedPhoto = { key: string; preview: string; path?: string; blob?: Blob };

type Props = {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  disabled?: boolean;
};

export default function PhotoPicker({ photos, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const room = MAX_PHOTOS - photos.length;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);
    const chosen = [...files];
    if (chosen.length > room) setMessage(`사진은 ${MAX_PHOTOS}장까지예요. 앞의 ${room}장만 넣었어요.`);

    setBusy(true);
    const added: PickedPhoto[] = [];
    for (const file of chosen.slice(0, room)) {
      try {
        // 고르자마자 줄여 두면, 미리보기도 가볍고 올릴 때도 빨라요.
        const blob = await compressImage(file);
        added.push({ key: crypto.randomUUID(), blob, preview: URL.createObjectURL(blob) });
      } catch {
        setMessage(`'${file.name}'은(는) 열 수 없는 사진 형식이에요. JPG나 PNG로 올려 주세요.`);
      }
    }
    setBusy(false);
    onChange([...photos, ...added]);
    if (inputRef.current) inputRef.current.value = ""; // 같은 사진을 다시 고를 수 있게 비워요
  }

  function remove(key: string) {
    const target = photos.find((p) => p.key === key);
    if (target?.blob) URL.revokeObjectURL(target.preview); // 미리보기용 임시 주소 정리
    onChange(photos.filter((p) => p.key !== key));
  }

  function makeCover(key: string) {
    const target = photos.find((p) => p.key === key)!;
    onChange([target, ...photos.filter((p) => p.key !== key)]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-display">
        사진 <span className="text-sm text-soil-soft">({photos.length}/{MAX_PHOTOS})</span>
      </span>

      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-1">
        {/* 사진 추가 버튼 */}
        {room > 0 && (
          <li className="shrink-0">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || busy}
              className="grid h-24 w-24 place-items-center rounded-2xl border-2 border-dashed border-soil/50 bg-[#fffaf0] text-soil-soft hover:border-skin hover:text-skin disabled:opacity-60"
            >
              <span className="flex flex-col items-center gap-0.5 text-sm">
                <span className="text-2xl">{busy ? "⏳" : "📷"}</span>
                {busy ? "준비 중…" : "사진 추가"}
              </span>
            </button>
          </li>
        )}

        {photos.map((p, i) => (
          <li key={p.key} className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- 아직 안 올린 사진(임시 주소)도 보여 줘야 해서 <img>를 써요 */}
            <img src={p.preview} alt={`사진 ${i + 1}`} className="h-24 w-24 rounded-2xl border-2 border-soil object-cover" />
            {i === 0 ? (
              <span className="absolute inset-x-0 bottom-0 rounded-b-2xl bg-soil/80 py-0.5 text-center text-[11px] text-white">대표 사진</span>
            ) : (
              <button
                type="button"
                onClick={() => makeCover(p.key)}
                disabled={disabled}
                className="absolute inset-x-0 bottom-0 rounded-b-2xl bg-hanji/85 py-0.5 text-center text-[11px] text-soil hover:bg-flesh-soft"
              >
                대표로
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(p.key)}
              disabled={disabled}
              aria-label={`사진 ${i + 1} 빼기`}
              className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-soil bg-hanji text-xs leading-none hover:bg-[#fbe4dc]"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {/* 실제 파일 고르기 칸은 숨기고, 위의 '사진 추가' 버튼으로 열어요. name이 없어서 폼에 파일이 섞여 가지 않아요. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => addFiles(e.target.files)}
      />
      <span className="text-xs text-soil-soft">첫 번째 사진이 목록에 보이는 대표 사진이에요. 최대 {MAX_PHOTOS}장까지 올릴 수 있어요.</span>
      {message && <span className="text-xs text-ember">{message}</span>}
    </div>
  );
}
