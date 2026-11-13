import Image from "next/image";
import Link from "next/link";
import { formatPrice, getCategory, photoUrl, timeAgo, type Item } from "@/lib/market";

// 매물 한 개 (목록에서 쓰는 카드). 누르면 상세 화면으로 가요.
// now: 몇 분 전인지 계산할 기준 시각 (목록 전체가 같은 기준을 쓰도록 밖에서 받아요)
export default function ItemCard({ item, now }: { item: Item; now: number }) {
  const done = item.status === "거래완료";
  const category = getCategory(item.category);

  return (
    <li className="border-b-2 border-dashed border-straw last:border-b-0 sm:border-b-0">
      <Link href={`/items/${item.id}`} className="group flex gap-4 py-4 sm:flex-col sm:gap-0 sm:py-0">
        {/* 대표 사진. 사진이 없는 글은 카테고리 그림을 보여 줘요 */}
        <div
          className="relative grid aspect-square w-28 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-soil sm:w-full"
          style={{ background: category?.tint }}
        >
          {item.photos.length > 0 ? (
            <>
              {/* next/image: 화면 크기에 맞게 사진을 줄여서 빨리 보여 줘요 */}
              <Image
                src={photoUrl(item.photos[0])}
                alt={item.title}
                fill
                sizes="(min-width: 1024px) 240px, (min-width: 640px) 30vw, 112px"
                className={`object-cover transition-transform group-hover:scale-105 ${done ? "opacity-50" : ""}`}
              />
              {item.photos.length > 1 && (
                <span className="absolute bottom-1.5 right-1.5 rounded-full bg-soil/75 px-1.5 py-0.5 text-[10px] text-white">
                  📷 {item.photos.length}
                </span>
              )}
            </>
          ) : (
            <span className={`text-5xl transition-transform group-hover:scale-110 sm:text-6xl ${done ? "opacity-40" : ""}`}>
              {category?.emoji ?? "📦"}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 sm:mt-3">
          <h3 className="line-clamp-2 leading-snug text-soil group-hover:text-skin">
            {item.is_hidden && <span className="mr-1 rounded bg-ember px-1 text-[10px] text-white">숨김</span>}
            {item.title}
          </h3>
          <p className="mt-1 text-xs text-soil-soft">
            {item.region ?? "동네 미설정"} ·{" "}
            {/* 끌어올린 글은 '끌올 n분 전'으로 보여요 */}
            {new Date(item.bumped_at).getTime() - new Date(item.created_at).getTime() > 60_000
              ? `끌올 ${timeAgo(item.bumped_at, now)}`
              : timeAgo(item.created_at, now)}
          </p>
          <p className="mt-1 flex items-center gap-1.5 font-display text-lg">
            {item.status !== "판매중" && (
              <span className={`rounded-md px-1.5 py-0.5 text-xs text-white ${done ? "bg-soil-soft" : "bg-leaf"}`}>
                {item.status}
              </span>
            )}
            {formatPrice(item.price)}
          </p>
          {/* 💬 채팅 수 · ♡ 좋아요 수 (0이면 숨겨요) */}
          {(item.chat_count > 0 || item.like_count > 0) && (
            <p className="mt-1 flex gap-3 text-xs text-soil-soft sm:justify-end">
              {item.chat_count > 0 && <span>💬 {item.chat_count}</span>}
              {item.like_count > 0 && <span>♡ {item.like_count}</span>}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
