"use client";
// 화면을 그리다 문제가 생겼을 때 보여 주는 안내 (Next.js 16의 error.tsx)
// 개발용 오류 대신, 사용자에게 "잠시 후 다시" 안내와 다시 시도 버튼을 보여 줘요.
// retry(): 이 부분만 다시 불러와 그려요. (Next.js 16에서 reset 대신 바뀐 이름)

import { useEffect } from "react";
import Link from "next/link";
import GogumaLogo from "@/components/GogumaLogo";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // 개발자가 원인을 볼 수 있게 브라우저 콘솔에 남겨요.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="card-sack flex flex-col items-center gap-2 px-6 py-10 text-center">
        <GogumaLogo size={90} />
        <h1 className="mt-3 font-display text-2xl">앗, 고구마가 덜 익었어요</h1>
        <p className="text-sm leading-relaxed text-soil-soft">
          잠깐 문제가 생겨서 화면을 불러오지 못했어요.
          <br />
          잠시 후 다시 시도해 주세요.
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => retry()} className="btn-goguma px-4! py-2! text-sm!">
            다시 시도
          </button>
          <Link href="/" className="btn-straw text-sm">홈으로</Link>
        </div>
      </div>
    </div>
  );
}
