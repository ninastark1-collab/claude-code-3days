"use client";
// 키워드 등록 폼, 키워드 지우기 버튼, 위치로 동네 인증 버튼
import { useActionState, useRef, useState } from "react";
import FormMessage from "@/components/FormMessage";
import { addKeyword, removeKeyword, verifyRegion } from "@/app/my/actions";

export function KeywordForm() {
  const [state, action, pending] = useActionState(addKeyword, undefined);
  return (
    // key: 등록에 성공할 때마다 입력칸을 비워요.
    <form key={state?.ok ?? "form"} action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input name="keyword" maxLength={20} required placeholder="예) 고구마, 자전거, 아이폰" aria-label="알림 받을 키워드" className="field flex-1" />
        <button type="submit" className="btn-goguma shrink-0 px-4! py-2! text-sm!" disabled={pending}>{pending ? "…" : "등록"}</button>
      </div>
      <FormMessage error={state?.error} />
    </form>
  );
}

export function RemoveKeywordButton({ keyword }: { keyword: string }) {
  return (
    <form action={removeKeyword.bind(null, keyword)}>
      <button type="submit" aria-label={`${keyword} 지우기`} className="ml-1 text-soil-soft hover:text-ember">✕</button>
    </form>
  );
}

// 위치로 동네 인증: 브라우저에 위치를 물어보고(허락 창이 떠요), 위도·경도를 서버로 보내요.
export function RegionVerifyButton() {
  const [state, action, pending] = useActionState(verifyRegion, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string>();

  function locate() {
    setGeoError(undefined);
    if (!navigator.geolocation) {
      setGeoError("이 브라우저는 위치 확인을 지원하지 않아요.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const form = formRef.current!;
        (form.elements.namedItem("lat") as HTMLInputElement).value = String(pos.coords.latitude);
        (form.elements.namedItem("lng") as HTMLInputElement).value = String(pos.coords.longitude);
        form.requestSubmit();
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "위치 권한이 거부됐어요. 브라우저 주소창 옆 자물쇠(🔒)에서 위치를 허용해 주세요."
            : "위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lat" />
      <input type="hidden" name="lng" />
      <button type="button" onClick={locate} className="btn-goguma" disabled={locating || pending}>
        {locating ? "위치 확인 중…" : pending ? "동네 찾는 중…" : "📍 지금 위치로 동네 인증하기"}
      </button>
      <FormMessage error={geoError ?? state?.error} />
    </form>
  );
}
