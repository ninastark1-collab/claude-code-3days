import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegionVerifyButton } from "@/components/KeywordAndRegionForms";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "동네 인증 · 고구마마켓" };

// 휴대폰 위치로 지금 있는 동네를 확인하고, 내 동네로 저장 + '인증됨' 표시를 해요.
export default function RegionPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <Link href="/my" className="text-sm text-soil-soft hover:text-skin">← 나의 고구마</Link>
      <div className="card-sack mt-3 px-5 py-6 sm:px-8">
        <h1 className="font-display text-3xl">동네 인증 📍</h1>
        <Suspense fallback={<div className="mt-4 h-24 animate-pulse rounded-xl bg-hanji-deep" />}>
          <Current />
        </Suspense>
        <div className="mt-6">
          <RegionVerifyButton />
        </div>
        <ul className="mt-6 list-disc space-y-1 pl-5 text-xs leading-relaxed text-soil-soft">
          <li>버튼을 누르면 브라우저가 위치 사용을 물어봐요. ‘허용’을 눌러 주세요.</li>
          <li>위치(위도·경도)는 동네 이름을 찾는 데만 쓰고 저장하지 않아요. 동네 이름만 저장돼요.</li>
          <li>
            동네 이름은 OpenStreetMap의 주소 찾기 서비스(Nominatim)로 찾아요. 이때 위치 좌표가 그 서비스로 전달돼요.
          </li>
          <li>나중에 ‘내 정보 수정’에서 동네를 손으로 바꾸면 인증 표시는 사라져요.</li>
        </ul>
      </div>
    </div>
  );
}

async function Current() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my/region");
  return (
    <p className="mt-3 rounded-xl bg-hanji-deep px-4 py-3 text-sm">
      지금 내 동네: <b>{user.region ?? "아직 없음"}</b>{" "}
      {user.regionVerified ? (
        <span className="ml-1 rounded-full bg-leaf px-2 py-0.5 text-xs text-white">✅ 인증됨</span>
      ) : (
        <span className="ml-1 text-xs text-soil-soft">(인증 전)</span>
      )}
    </p>
  );
}
