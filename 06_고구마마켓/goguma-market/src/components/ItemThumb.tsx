import Image from "next/image";
import { getCategory, photoUrl, type Item } from "@/lib/market";

// 작은 판매글 썸네일 (채팅 목록·대화방 위쪽에서 써요). 사진이 없으면 카테고리 그림.
export default function ItemThumb({ item, size = 48 }: { item: Pick<Item, "title" | "category" | "photos"> | null; size?: number }) {
  const category = item ? getCategory(item.category) : undefined;
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-soil"
      style={{ width: size, height: size, background: category?.tint ?? "#ede0c6" }}
    >
      {item?.photos?.[0] ? (
        <Image src={photoUrl(item.photos[0])} alt={item.title} fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.5 }}>{category?.emoji ?? "📦"}</span>
      )}
    </span>
  );
}
