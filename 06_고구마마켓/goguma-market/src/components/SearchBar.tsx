// 검색창: <form method="get">이라서 자바스크립트 없이도 /search?q=... 로 이동해요.
export default function SearchBar({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action="/search" className="relative">
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="우리 동네에서 찾고 싶은 물건을 검색해 보세요"
        className="field rounded-full! bg-[#fffaf0]! py-3! pl-11! pr-24!"
        aria-label="물건 검색"
      />
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg">🔍</span>
      <button type="submit" className="btn-goguma absolute right-1.5 top-1/2 -translate-y-1/2 px-4! py-1.5! text-sm!">
        찾기
      </button>
    </form>
  );
}
