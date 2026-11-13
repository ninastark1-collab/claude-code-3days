import Link from "next/link";
import GogumaLogo from "@/components/GogumaLogo";

// 없는 주소나 지워진 판매글에 들어왔을 때 보여 주는 화면 (notFound()를 불러도 여기로 와요)
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="card-sack flex flex-col items-center gap-2 px-6 py-10 text-center">
        <GogumaLogo size={90} />
        <h1 className="mt-3 font-display text-2xl">이 밭엔 아무것도 없어요</h1>
        <p className="text-sm leading-relaxed text-soil-soft">
          주소가 바뀌었거나, 이미 거래가 끝나서 지워진 글일 수 있어요.
        </p>
        <Link href="/" className="btn-goguma mt-4 px-4! py-2! text-sm!">홈으로 가기</Link>
      </div>
    </div>
  );
}
