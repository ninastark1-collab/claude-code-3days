import type { Metadata } from "next";
import { OnlineList } from "@/components/Presence";

export const metadata: Metadata = { title: "접속 중인 이웃 · 고구마마켓" };

// 지금 고구마마켓에 접속해 있는 이웃 (접속 상태 공개를 켠 사람만 보여요)
export default function OnlinePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="font-display text-3xl">접속 중인 이웃 🟢</h1>
      <p className="mt-1 text-sm text-soil-soft">
        지금 고구마마켓을 보고 있는 이웃이에요. 내 접속 상태는 ‘나의 고구마 → 내 정보 수정’에서 숨길 수 있어요.
      </p>
      <OnlineList />
    </div>
  );
}
