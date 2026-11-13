import Link from "next/link";
import { CATEGORIES } from "@/lib/market";

// 카테고리 바구니들
export default function CategoryGrid() {
  return (
    <ul className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-8">
      {CATEGORIES.map((c) => (
        <li key={c.slug}>
          <Link href={`/category/${c.slug}`} className="group flex flex-col items-center gap-1.5 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-[1.1rem_1.4rem_1rem_1.3rem] border-2 border-soil bg-[#fffaf0] text-2xl shadow-[2px_3px_0_var(--color-soil)] transition group-hover:-translate-y-0.5 group-hover:bg-flesh-soft">
              {c.emoji}
            </span>
            <span className="text-xs leading-tight text-soil group-hover:text-skin">{c.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
