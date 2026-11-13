"use client";
// 상세 화면을 열면: ① 조회수 +1 (같은 사람·같은 브라우저는 하루 한 번만)
//                    ② '최근 본 상품'에 기록 (이 브라우저에만 저장, 서버로 안 보내요)
import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, getCategory, photoUrl } from "@/lib/market";

const RECENT_KEY = "goguma-recent";
const VIEWER_KEY = "goguma-viewer";

export type RecentItem = { id: number; title: string; price: number; category: string; photo: string | null };

function readRecent(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function ViewTracker({ item, userId }: { item: RecentItem; userId?: string }) {
  useEffect(() => {
    // ② 최근 본 상품 (같은 글은 맨 앞으로, 최대 12개)
    try {
      const list = [item, ...readRecent().filter((r) => r.id !== item.id)].slice(0, 12);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
      window.dispatchEvent(new Event("goguma-recent"));
    } catch {
      // 사생활 보호 모드 등에서는 저장이 안 될 수 있어요. 괜찮아요.
    }

    // ① 조회수: 로그인했으면 내 id, 아니면 이 브라우저용 무작위 번호로 하루 한 번만
    let viewer = userId;
    if (!viewer) {
      try {
        viewer = localStorage.getItem(VIEWER_KEY) ?? undefined;
        if (!viewer) {
          viewer = crypto.randomUUID();
          localStorage.setItem(VIEWER_KEY, viewer);
        }
      } catch {
        viewer = crypto.randomUUID();
      }
    }
    // 이미 오늘 센 조회면 DB가 '중복(409)'으로 거절해요. 그건 정상이라 그냥 무시해요.
    createClient().from("item_views").insert({ item_id: item.id, viewer }).then(() => {});
    // 글 번호가 바뀔 때만 다시 실행해요. (좋아요 등으로 화면이 다시 그려질 때마다 조회를 또 보내지 않게)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, userId]);
  return null;
}

// 홈의 '최근 본 상품' 줄 (브라우저에 저장된 목록이라 서버에선 비어 있다가 바로 채워져요)
function subscribe(cb: () => void) {
  window.addEventListener("goguma-recent", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("goguma-recent", cb);
    window.removeEventListener("storage", cb);
  };
}
let cacheRaw = "";
let cacheList: RecentItem[] = [];
function snapshot() {
  let raw = "[]";
  try {
    raw = localStorage.getItem(RECENT_KEY) ?? "[]";
  } catch {}
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cacheList = readRecent();
  }
  return cacheList;
}
const empty: RecentItem[] = [];

export function RecentlyViewed() {
  // useSyncExternalStore: 브라우저 저장소 같은 '바깥 값'을 안전하게 화면에 쓰는 방법 (서버에선 빈 목록)
  const list = useSyncExternalStore(subscribe, snapshot, () => empty);
  if (list.length === 0) return null;
  return (
    <section className="mt-10" aria-label="최근 본 상품">
      <h2 className="mb-3 font-display text-xl">최근 본 상품 👀</h2>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {list.map((r) => {
          const c = getCategory(r.category);
          return (
            <li key={r.id} className="w-28 shrink-0">
              <Link href={`/items/${r.id}`} className="group block">
                <span className="relative grid aspect-square place-items-center overflow-hidden rounded-xl border-2 border-soil" style={{ background: c?.tint }}>
                  {r.photo ? (
                    <Image src={photoUrl(r.photo)} alt={r.title} fill sizes="112px" className="object-cover" />
                  ) : (
                    <span className="text-3xl">{c?.emoji ?? "📦"}</span>
                  )}
                </span>
                <span className="mt-1 block truncate text-xs group-hover:text-skin">{r.title}</span>
                <span className="block font-display text-sm">{formatPrice(r.price)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
