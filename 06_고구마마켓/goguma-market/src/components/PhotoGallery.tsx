"use client";
// 판매글 상세의 사진 넘겨 보기
// 휴대폰에선 손가락으로 옆으로 밀고, PC에선 ◀ ▶ 버튼이나 아래 점을 눌러 넘겨요.
// (CSS scroll-snap: 스크롤이 사진 한 장 단위로 '착' 멈추게 해 주는 기능)
// 사진을 누르면 화면 가득 크게 볼 수 있어요. (닫기: ✕ 버튼 또는 ESC 키)

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export default function PhotoGallery({ urls, alt, dim }: { urls: string[]; alt: string; dim?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const many = urls.length > 1;
  const [zoom, setZoom] = useState<number | null>(null); // 크게 보는 중인 사진 번호

  // 크게 보기: ESC로 닫고, 그동안 뒤 화면이 스크롤되지 않게 막아요.
  useEffect(() => {
    if (zoom === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [zoom]);

  // 스크롤 위치로 지금 몇 번째 사진인지 계산해요.
  function onScroll() {
    const el = trackRef.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function go(i: number) {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="relative border-b-2 border-soil bg-soil">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex aspect-square snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] sm:aspect-[4/3]"
      >
        {urls.map((url, i) => (
          <button
            type="button"
            key={url}
            onClick={() => setZoom(i)}
            aria-label={`${i + 1}번째 사진 크게 보기`}
            className="relative h-full w-full shrink-0 snap-center cursor-zoom-in"
          >
            <Image
              src={url}
              alt={`${alt} 사진 ${i + 1}`}
              fill
              sizes="(min-width: 672px) 672px, 100vw"
              priority={i === 0}
              className={`object-contain ${dim ? "opacity-60" : ""}`}
            />
          </button>
        ))}
      </div>

      {/* 크게 보기 (화면 전체) */}
      {zoom !== null && (
        <div role="dialog" aria-modal="true" aria-label="사진 크게 보기" className="fixed inset-0 z-[60] bg-black/95">
          <div
            ref={(el) => {
              // 처음 열 때 누른 사진 위치로 바로 이동
              if (el && el.dataset.ready !== "1") {
                el.scrollLeft = zoom * el.clientWidth;
                el.dataset.ready = "1";
              }
            }}
            className="flex h-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
          >
            {urls.map((url, i) => (
              <div key={url} className="relative h-full w-full shrink-0 snap-center">
                <Image src={url} alt={`${alt} 사진 ${i + 1}`} fill sizes="100vw" className="object-contain" />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setZoom(null)}
            aria-label="닫기"
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full border-2 border-hanji bg-black/60 text-xl text-hanji"
          >
            ✕
          </button>
          {many && <p className="absolute inset-x-0 bottom-6 text-center text-sm text-hanji/80">옆으로 넘겨서 다른 사진을 볼 수 있어요</p>}
        </div>
      )}

      {many && (
        <>
          <span className="absolute right-3 top-3 rounded-full bg-soil/75 px-2.5 py-0.5 text-xs text-white">
            {index + 1} / {urls.length}
          </span>
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="이전 사진"
              className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border-2 border-soil bg-hanji/90 sm:grid"
            >
              ◀
            </button>
          )}
          {index < urls.length - 1 && (
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="다음 사진"
              className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border-2 border-soil bg-hanji/90 sm:grid"
            >
              ▶
            </button>
          )}
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {urls.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => go(i)}
                aria-label={`${i + 1}번째 사진 보기`}
                className={`h-2 rounded-full transition-all ${i === index ? "w-5 bg-flesh" : "w-2 bg-hanji/70"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
