import Link from "next/link";
import GogumaLogo from "@/components/GogumaLogo";

// 아직 만들지 않은 메뉴에 보여 주는 화면
export default function ComingSoon({ title, desc, emoji }: { title: string; desc: string; emoji: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="card-sack flex flex-col items-center gap-2 px-6 py-10 text-center">
        <span className="text-5xl">{emoji}</span>
        <h1 className="mt-2 font-display text-3xl">{title}</h1>
        <p className="text-sm leading-relaxed text-soil-soft">{desc}</p>
        <div className="my-4">
          <GogumaLogo size={90} />
        </div>
        <p className="rounded-full border-2 border-soil bg-flesh-soft px-3 py-1 font-display text-sm">
          🌱 다음 수확 때 찾아올게요
        </p>
        <Link href="/" className="mt-4 text-sm text-soil-soft underline decoration-wavy underline-offset-4 hover:text-skin">
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
