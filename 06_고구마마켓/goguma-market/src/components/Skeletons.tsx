// 데이터를 불러오는 동안 보여 주는 회색 틀(스켈레톤)
// 글자("불러오는 중…")보다 실제 화면 모양과 비슷해서, 기다리는 느낌이 덜해요.

function Bar({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-hanji-deep ${className}`} />;
}

// 판매글 카드 목록 모양
export function ItemGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex gap-4 border-b-2 border-dashed border-straw py-4 sm:flex-col sm:gap-0 sm:border-b-0 sm:py-0">
          <span className="block aspect-square w-28 shrink-0 animate-pulse rounded-2xl border-2 border-straw bg-hanji-deep sm:w-full" />
          <span className="flex flex-1 flex-col gap-2 sm:mt-3">
            <Bar className="h-4 w-4/5" />
            <Bar className="h-3 w-1/2" />
            <Bar className="h-5 w-2/5" />
          </span>
        </li>
      ))}
    </ul>
  );
}

// 줄 목록 모양 (채팅 목록, 알림 등)
export function RowListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="stitch mt-6 divide-y-2 divide-dashed divide-straw" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3.5">
          <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-hanji-deep" />
          <span className="flex flex-1 flex-col gap-2">
            <Bar className="h-4 w-1/3" />
            <Bar className="h-3 w-2/3" />
          </span>
        </li>
      ))}
    </ul>
  );
}

// 판매글 상세 모양
export function DetailSkeleton() {
  return (
    <div className="card-sack mt-3 overflow-hidden lg:grid lg:grid-cols-2" aria-hidden>
      <span className="block aspect-square animate-pulse bg-hanji-deep sm:aspect-[4/3] lg:aspect-auto lg:min-h-[28rem]" />
      <span className="flex flex-col gap-3 px-5 py-6 sm:px-8">
        <Bar className="h-10 w-10 rounded-full" />
        <Bar className="h-7 w-3/4" />
        <Bar className="h-3 w-1/3" />
        <Bar className="mt-4 h-4 w-full" />
        <Bar className="h-4 w-5/6" />
        <Bar className="h-4 w-2/3" />
      </span>
    </div>
  );
}
