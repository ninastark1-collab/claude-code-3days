"use client";
// 채팅방의 '거래 약속' 칸: 가격·장소·시간을 정해서 구매확정 → 예약중 → 거래완료
//  1) 둘 중 한 명이 약속을 제안해요. (가격은 판매 가격이 미리 채워져 있어요)
//  2) 상대가 '수락'하면 물건이 자동으로 '예약중'이 돼요. (거절도 가능)
//  3) 만나서 거래가 끝나면 판매자가 '거래완료'를 눌러요. → 구매자 지정 + 서로 후기
//  4) 사정이 생기면 둘 중 누구나 '약속 취소' → 물건이 다시 '판매중'
// 누가 무엇을 누를 수 있는지는 DB 규칙(트리거)이 최종 검사하고, 단계마다 대화방에 안내 메시지가 남아요.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, friendlyDbError } from "@/lib/market";

type Deal = {
  id: number;
  proposed_by: string;
  price: number;
  meet_at: string | null;
  meet_place: string;
  status: "proposed" | "accepted" | "completed" | "canceled" | "declined";
};

type Props = {
  roomId: number;
  itemId: number;
  sellerId: string;
  buyerId: string;
  myId: string;
  itemPrice: number;
  itemStatus: string; // 판매중 / 예약중 / 거래완료
  otherName: string;
  blocked: boolean;
};

const whenFmt = new Intl.DateTimeFormat("ko-KR", {
  month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul",
});

export default function DealPanel(p: Props) {
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const iAmSeller = p.myId === p.sellerId;

  // 이 대화방의 가장 최근 약속을 불러오고, 바뀌면(상대가 수락 등) 실시간으로 다시 불러와요.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("deals")
        .select("id, proposed_by, price, meet_at, meet_place, status")
        .eq("room_id", p.roomId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setDeal((data as Deal) ?? null);
        setLoaded(true);
      }
    };
    let channel: ReturnType<typeof supabase.channel> | undefined;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel(`deal-${p.roomId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `room_id=eq.${p.roomId}` }, () => {
          load();
          router.refresh(); // 위쪽 물건 상태(예약중 등)도 새로 그려요
        })
        // 실시간 연결이 준비된 순간에 한 번 더 불러와요. (연결되기 전 틈에 생긴 변화도 놓치지 않게)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") load();
        });
      load();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [p.roomId, router]);

  async function run(task: () => PromiseLike<{ error: { message: string; code?: string } | null }>) {
    setBusy(true);
    setError(undefined);
    const { error } = await task();
    setBusy(false);
    if (error) {
      setError(error.code === "23505" ? "이미 진행 중인 약속이 있어요. 화면을 새로 고쳐 주세요." : friendlyDbError(error.message));
      return false;
    }
    router.refresh();
    return true;
  }

  function propose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const price = Number(String(f.get("price") ?? "").replace(/[,\s원]/g, ""));
    const when = String(f.get("meetAt") ?? "");
    const place = String(f.get("meetPlace") ?? "").trim().slice(0, 60);
    if (!Number.isInteger(price) || price < 0 || price > 100_000_000) {
      setError("가격을 숫자로 적어 주세요.");
      return;
    }
    // datetime-local 값(예: 2026-11-12T15:00)은 내 기기 시각 기준이라, 그대로 Date로 바꿔 저장해요.
    const meetAt = when ? new Date(when).toISOString() : null;
    run(() =>
      createClient().from("deals").insert({
        room_id: p.roomId, item_id: p.itemId, seller_id: p.sellerId, buyer_id: p.buyerId,
        proposed_by: p.myId, price, meet_at: meetAt, meet_place: place,
      }),
    ).then((ok) => ok && setOpen(false));
  }

  // 단계 바꾸기는 DB 함수(rpc)로 해요: 물건 줄을 먼저 잠가서, 두 방에서 동시에 수락해도 서로 멈추지(교착) 않아요.
  const setStatus = (status: Deal["status"]) =>
    run(() => createClient().rpc("goguma_set_deal_status", { p_deal: deal!.id, p_status: status }));

  if (!loaded || p.blocked) return null;

  const info = deal && (
    <span className="block text-xs text-soil-soft">
      {formatPrice(deal.price)}
      {deal.meet_at && ` · ${whenFmt.format(new Date(deal.meet_at))}`}
      {deal.meet_place && ` · ${deal.meet_place}`}
    </span>
  );
  const box = "mx-4 mb-2 rounded-xl border-2 px-3 py-2 text-sm";
  const open_ = deal && (deal.status === "proposed" || deal.status === "accepted");

  return (
    <div>
      {deal?.status === "proposed" && (
        <div className={`${box} border-flesh bg-flesh-soft/60`}>
          <b>🤝 거래 약속 제안</b> {deal.proposed_by === p.myId ? `— ${p.otherName}님의 답을 기다려요` : `— ${p.otherName}님이 제안했어요`}
          {info}
          <div className="mt-2 flex gap-2">
            {deal.proposed_by === p.myId ? (
              <button type="button" disabled={busy} onClick={() => setStatus("canceled")} className="btn-straw px-3! py-1! text-xs">제안 철회</button>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => setStatus("accepted")} className="btn-goguma px-3! py-1! text-xs!">✅ 수락 (예약중으로)</button>
                <button type="button" disabled={busy} onClick={() => setStatus("declined")} className="btn-straw px-3! py-1! text-xs">거절</button>
              </>
            )}
          </div>
        </div>
      )}

      {deal?.status === "accepted" && (
        <div className={`${box} border-leaf bg-[#e7efd8]`}>
          <b className="text-leaf">📅 예약중 — 거래 약속이 잡혔어요</b>
          {info}
          <div className="mt-2 flex gap-2">
            {iAmSeller && (
              <button
                type="button"
                disabled={busy}
                onClick={() => confirm("물건을 건네고 거래를 마쳤나요? 거래완료로 바꿀게요.") && setStatus("completed")}
                className="btn-goguma px-3! py-1! text-xs!"
              >
                🎉 거래완료
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => confirm("약속을 취소할까요? 물건이 다시 판매중이 돼요.") && setStatus("canceled")}
              className="btn-straw px-3! py-1! text-xs"
            >
              약속 취소
            </button>
          </div>
          {!iAmSeller && <span className="mt-1 block text-[11px] text-soil-soft">만나서 거래를 마치면 판매자가 ‘거래완료’를 눌러요.</span>}
        </div>
      )}

      {deal?.status === "completed" && (
        <div className={`${box} border-soil/30 bg-hanji-deep`}>
          🎉 거래가 완료됐어요! {info}
          <Link href={`/items/${p.itemId}`} className="mt-1 inline-block text-xs underline underline-offset-2 hover:text-skin">💌 후기 남기러 가기</Link>
        </div>
      )}

      {/* 약속이 없거나 끝났고, 물건이 판매중이면: 약속 잡기 */}
      {!open_ && p.itemStatus === "판매중" && (
        open ? (
          <form onSubmit={propose} className={`${box} flex flex-col gap-2 border-flesh bg-[#fffaf0]`}>
            <b>🤝 거래 약속 잡기 (구매확정)</b>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-12 shrink-0">가격</span>
              <input name="price" inputMode="numeric" defaultValue={p.itemPrice} required className="field flex-1 py-1.5!" />
              <span>원</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-12 shrink-0">날짜</span>
              <input name="meetAt" type="datetime-local" className="field flex-1 py-1.5!" />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-12 shrink-0">장소</span>
              <input name="meetPlace" maxLength={60} placeholder="예) 가남읍 행정복지센터 앞" className="field flex-1 py-1.5!" />
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="btn-goguma flex-1 px-3! py-1.5! text-sm!">{busy ? "보내는 중…" : "약속 제안하기"}</button>
              <button type="button" onClick={() => setOpen(false)} className="btn-straw text-xs">닫기</button>
            </div>
            <span className="text-[11px] text-soil-soft">상대가 수락하면 물건이 ‘예약중’으로 바뀌어요.</span>
          </form>
        ) : (
          <div className="mx-4 mb-2">
            <button type="button" onClick={() => setOpen(true)} className="btn-straw w-full text-sm">
              🤝 가격 협의가 끝났나요? 거래 약속 잡기
            </button>
          </div>
        )
      )}
      {error && <p className="mx-4 mb-2 text-xs text-ember">{error}</p>}
    </div>
  );
}
