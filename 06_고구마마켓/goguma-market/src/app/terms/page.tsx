import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "이용약관 · 고구마마켓" };

// 이용약관 (공부용 프로젝트에 맞춘 간단한 약관이에요. 실제 서비스라면 법률 검토가 필요해요)
const SECTIONS: { title: string; body: string[] }[] = [
  { title: "1. 서비스 소개", body: ["고구마마켓은 이웃끼리 중고 물건을 사고팔고, 동네 이야기를 나누는 공간이에요.", "고구마마켓은 거래를 연결해 줄 뿐, 거래의 당사자가 아니에요. 물건과 돈은 이용자끼리 직접 주고받아요."] },
  { title: "2. 회원가입", body: ["이메일과 닉네임으로 가입할 수 있어요.", "다른 사람의 정보로 가입하거나, 한 사람이 여러 계정으로 다른 이용자를 속이면 안 돼요."] },
  { title: "3. 올리면 안 되는 물건과 글", body: ["법으로 거래가 금지된 물건(술·담배·의약품·위조품·개인정보 등)", "다른 사람을 속이거나 괴롭히는 글, 욕설·비방, 광고·도배"] },
  { title: "4. 안전한 거래", body: ["가능하면 직접 만나서 물건을 확인하고 거래해 주세요.", "선입금 요구나 외부 메신저로 유도하는 경우는 사기일 수 있어요. 의심되면 ‘신고하기’를 눌러 주세요."] },
  { title: "5. 신고와 이용 제한", body: ["신고된 글은 운영자가 확인한 뒤 숨기거나 지울 수 있어요.", "규칙을 반복해서 어기면 이용이 제한될 수 있어요."] },
  { title: "6. 탈퇴", body: ["‘나의 고구마 → 내 정보 수정 → 회원 탈퇴’에서 언제든 탈퇴할 수 있어요. 탈퇴하면 올린 글·사진·댓글·채팅이 모두 지워져요."] },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-soil-soft hover:text-skin">← 홈으로</Link>
      <article className="card-sack mt-3 px-5 py-6 sm:px-8">
        <h1 className="font-display text-3xl">이용약관 📜</h1>
        <p className="mt-1 text-xs text-soil-soft">시행일: 2026년 11월 11일 · 개발 공부용 프로젝트의 약관이에요.</p>
        {SECTIONS.map((sec) => (
          <section key={sec.title} className="mt-6">
            <h2 className="font-display text-lg">{sec.title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
              {sec.body.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </section>
        ))}
        <p className="mt-8 text-sm">
          개인정보를 어떻게 다루는지는 <Link href="/privacy" className="underline underline-offset-2 hover:text-skin">개인정보처리방침</Link>에서 볼 수 있어요.
        </p>
      </article>
    </div>
  );
}
