import ItemCard from "@/components/ItemCard";
import { getRequestTime } from "@/lib/items";
import type { Item } from "@/lib/market";

// 판매글 카드 목록 (홈 / 카테고리 / 검색에서 같이 써요). 글이 없으면 empty를 보여 줘요.
export default async function ItemList({ items, empty }: { items: Item[]; empty: React.ReactNode }) {
  if (items.length === 0) return <>{empty}</>;

  const now = await getRequestTime();
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4">
      {items.map((item) => (
        <ItemCard key={item.id} item={item} now={now} />
      ))}
    </ul>
  );
}

// 목록이 비었을 때 보여 주는 안내 상자
export function EmptyBox({ emoji, title, desc, children }: { emoji: string; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="stitch flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="text-5xl">{emoji}</span>
      <p className="font-display text-xl">{title}</p>
      <p className="text-sm text-soil-soft">{desc}</p>
      {children}
    </div>
  );
}
