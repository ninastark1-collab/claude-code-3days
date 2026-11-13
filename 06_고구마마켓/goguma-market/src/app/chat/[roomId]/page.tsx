import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar, TempBadge } from "@/components/Avatar";
import ChatRoomView from "@/components/ChatRoomView";
import DealPanel from "@/components/DealPanel";
import ItemThumb from "@/components/ItemThumb";
import { BlockButton, ReportButton } from "@/components/SafetyButtons";
import { OnlineStatus } from "@/components/Presence";
import { getRequestTime } from "@/lib/items";
import { timeAgo } from "@/lib/market";
import { leaveChatRoom } from "@/app/chat/actions";
import { getCurrentUser } from "@/lib/auth";
import { getChatRoom } from "@/lib/social";
import { isBlockedBetween, isBlockedByMe } from "@/lib/trust";
import { formatPrice } from "@/lib/market";

export const metadata: Metadata = { title: "대화방 · 고구마마켓" };

// 1:1 대화방. 주소의 방 번호는 요청 때 알 수 있어서 Suspense 안에서 읽어요.
export default function ChatRoomPage({ params }: PageProps<"/chat/[roomId]">) {
  return (
    <div className="mx-auto max-w-2xl">
      <Suspense fallback={<div className="h-[70vh] animate-pulse bg-hanji-deep/50" />}>
        <Room params={params} />
      </Suspense>
    </div>
  );
}

async function Room({ params }: { params: PageProps<"/chat/[roomId]">["params"] }) {
  const { roomId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/chat/${roomId}`);

  // 방의 두 사람이 아니면 RLS 때문에 방이 안 보여요 → '없는 페이지'
  const data = await getChatRoom(roomId);
  if (!data) notFound();
  const { room, messages } = data;

  const iAmSeller = room.seller_id === user.id;
  const otherId = iAmSeller ? room.buyer_id : room.seller_id;
  const other = iAmSeller ? room.buyer : room.seller;
  const otherName = other?.nickname ?? "알 수 없음";
  // blockedByMe: '차단 풀기' 버튼용 / blocked: 어느 쪽이든 차단이면 보내기·약속을 막아요
  const [blockedByMe, blocked, now] = await Promise.all([
    isBlockedByMe(user.id, otherId),
    isBlockedBetween(user.id, otherId),
    getRequestTime(),
  ]);
  const item = room.item;
  const back = `/chat/${room.id}`;

  return (
    <div className="border-x-0 border-soil sm:border-x-2">
      {/* 위쪽: 상대 프로필 + 어떤 물건 이야기인지 + 메뉴 */}
      <div className="sticky top-[60px] z-10 border-b-2 border-soil bg-hanji/95 backdrop-blur sm:top-[66px]">
        <div className="flex items-center gap-2 px-4 pt-3">
          <Link href="/chat" className="text-soil-soft hover:text-skin" aria-label="채팅 목록으로">←</Link>
          <Link href={`/users/${otherId}`} className="flex min-w-0 items-center gap-2 hover:text-skin">
            <Avatar emoji={other?.avatar} size={32} />
            <span className="truncate font-display text-lg">{otherName}</span>
          </Link>
          <span className="text-xs text-soil-soft">{iAmSeller ? "구매 문의" : "판매자"}</span>
          <OnlineStatus userId={otherId} lastSeenText={other?.last_seen_at ? timeAgo(other.last_seen_at, now) : null} />
          <span className="ml-auto">
            <TempBadge temp={Number(other?.manner_temp ?? 36.5)} compact />
          </span>
          {/* 메뉴: 신고 / 차단 / 나가기 */}
          <details className="relative">
            <summary className="cursor-pointer list-none px-1 text-xl text-soil-soft" aria-label="메뉴">⋮</summary>
            <div className="absolute right-0 top-8 z-20 flex w-36 flex-col gap-3 rounded-xl border-2 border-soil bg-hanji p-3 text-sm shadow-[3px_4px_0_var(--color-soil)]">
              <ReportButton targetType="chat" targetId={room.id} back={back} label="🚨 신고하기" className="text-left hover:text-ember" />
              <BlockButton otherId={otherId} nickname={otherName} back={back} blocked={blockedByMe} className="text-left hover:text-ember" />
              <form action={leaveChatRoom.bind(null, room.id)}>
                <button type="submit" className="text-left hover:text-ember">👋 채팅방 나가기</button>
              </form>
            </div>
          </details>
        </div>
        {item ? (
          <div className="flex items-center gap-3 px-4 py-2.5">
            <Link href={`/items/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-skin">
              <ItemThumb item={item} size={44} />
              <span className="min-w-0">
                <span className="block truncate text-sm">
                  {item.status !== "판매중" && <b className="mr-1 text-leaf">{item.status}</b>}
                  {item.title}
                </span>
                <span className="font-display">{formatPrice(item.price)}</span>
              </span>
            </Link>
            {item.status === "거래완료" && item.buyer_id && (iAmSeller || item.buyer_id === user.id) && (
              <Link href={`/items/${item.id}`} className="btn-straw shrink-0 px-3! py-1.5! text-xs">💌 후기 남기기</Link>
            )}
          </div>
        ) : (
          <p className="px-4 py-2.5 text-sm text-soil-soft">삭제됐거나 운영 정책으로 숨겨진 판매글이에요.</p>
        )}
        {/* 거래 약속: 가격 협의 → 구매확정(수락) → 예약중 → 거래완료 */}
        {item && (
          <DealPanel
            roomId={room.id}
            itemId={item.id}
            sellerId={room.seller_id}
            buyerId={room.buyer_id}
            myId={user.id}
            itemPrice={item.price}
            itemStatus={item.status}
            otherName={otherName}
            blocked={blocked}
          />
        )}
      </div>

      <ChatRoomView
        roomId={room.id}
        myId={user.id}
        otherName={otherName}
        initialMessages={messages}
        canOffer={!iAmSeller && !!item?.accept_offers && item.status !== "거래완료"}
        blocked={blocked}
      />
    </div>
  );
}
