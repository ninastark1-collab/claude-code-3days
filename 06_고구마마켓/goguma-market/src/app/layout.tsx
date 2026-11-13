import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Toaster from "@/components/Toaster";
import { Gowun_Dodum, Jua } from "next/font/google";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import "./globals.css";

// 제목용: 동글동글한 Jua / 본문용: 단정한 고운돋움
const jua = Jua({ weight: "400", variable: "--font-jua", preload: false });
const gowun = Gowun_Dodum({ weight: "400", variable: "--font-gowun", preload: false });

// 휴대폰 위쪽 상태 표시줄 색을 고구마 껍질색으로
export const viewport: Viewport = { themeColor: "#8c3b5e" };

export const metadata: Metadata = {
  // 공유 미리보기 그림 주소를 '전체 주소'로 만들 때 쓰는 기준 주소
  metadataBase: new URL("https://goguma-market-blond.vercel.app"),
  title: "고구마마켓 — 우리 동네 구수한 중고거래",
  description: "흙 묻은 손으로 건네는 우리 동네 중고거래, 고구마마켓",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${jua.variable} ${gowun.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* 키보드·화면 읽기 프로그램 사용자를 위한 '본문으로 건너뛰기' (Tab을 누르면 처음에 보여요) */}
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-skin px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          본문으로 건너뛰기
        </a>
        <Header />
        <main id="main" className="flex-1">{children}</main>
        {/* 휴대폰에선 아래 고정 메뉴에 가리지 않도록 여백을 둡니다 */}
        <footer className="border-t-2 border-dashed border-straw pb-24 pt-6 text-center text-sm text-soil-soft md:pb-6">
          🍠 고구마마켓 · 우리 동네 밭에서 캐낸 중고거래
          {/* 예시 판매글 사진의 작가·라이선스 표시 (CC BY 사진은 출처를 밝혀야 해요) */}
          <span className="mt-1 flex justify-center gap-3 text-xs">
            <Link href="/terms" className="underline underline-offset-2 hover:text-skin">이용약관</Link>
            <Link href="/privacy" className="underline underline-offset-2 hover:text-skin">개인정보처리방침</Link>
            <Link href="/credits" className="underline underline-offset-2 hover:text-skin">사진 출처</Link>
          </span>
        </footer>
        <BottomNav />
        {/* 토스트는 주소의 ?toast=를 읽어서, 요청 때만 알 수 있으니 Suspense 안에 둬요 */}
        <Suspense fallback={null}>
          <Toaster />
        </Suspense>
      </body>
    </html>
  );
}
