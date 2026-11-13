import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ItemThumb from "@/components/ItemThumb";
import { Avatar } from "@/components/Avatar";
import { RowListSkeleton } from "@/components/Skeletons";
import { EmptyBox } from "@/components/ItemList";
import { getCurrentUser } from "@/lib/auth";
import { getRequestTime } from "@/lib/items";
import { getMyChatRooms } from "@/lib/social";
import { timeAgo } from "@/lib/market";

export const metadata: Metadata = { title: "채팅 · 고구마마켓" };

// 내 채팅 목록 (로그인 안 했으면 proxy.ts가 로그인 화면으로 보내요)
export default function ChatPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl">채팅 💬</h1>
      <Suspense fallback={<RowListSkeleton />}>
        <RoomList />
      </Suspense>
    </div>
  );
}

async function RoomList() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/chat");
  const [rooms, now] = await Promise.all([getMyChatRooms(user.id), getRequestTime()]);

  if (rooms.length === 0)
    return (
      <div className="mt-6">
        <EmptyBox emoji="💬" title="아직 나눈 대화가 없어요" desc="마음에 드는 물건을 찾아 '채팅하기'를 눌러 보세요.">
          <Link href="/" className="btn-goguma mt-3 px-4! py-2! text-sm!">물건 구경하러 가기</Link>
        </EmptyBox>
      </div>
    );

  return (
    <ul className="stitch mt-6 divide-y-2 divide-dashed divide-straw bg-[#fffaf0]/70">
      {rooms.map((room) => {
        const iAmSeller = room.seller_id === user.id;
        const other = (iAmSeller ? room.buyer : room.seller)?.nickname ?? "알 수 없음";
        return (
          <li key={room.id}>
            <Link href={`/chat/${room.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-flesh-soft/40">
              <Avatar emoji={(iAmSeller ? room.buyer : room.seller)?.avatar} size={44} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="truncate font-display">{other}</span>
                  <span className="shrink-0 text-[11px] text-soil-soft">
                    {iAmSeller ? "구매 문의" : "판매자"} · {timeAgo(room.last_message_at ?? room.created_at, now)}
                  </span>
                </span>
                <span className="block truncate text-sm text-soil-soft">{room.last_message === "" ? "📷 사진" : (room.last_message ?? "아직 메시지가 없어요")}</span>
              </span>
              {room.unread > 0 && (
                <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-ember px-1.5 text-xs text-white">
                  {room.unread}
                </span>
              )}
              <ItemThumb item={room.item} size={44} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
