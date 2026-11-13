import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "개인정보처리방침 · 고구마마켓" };

// 개인정보처리방침: 무엇을 모으고, 왜 쓰고, 어디에 두고, 언제 지우는지
const ROWS: [string, string, string][] = [
  ["이메일, 비밀번호(암호화)", "로그인, 비밀번호 찾기 메일", "탈퇴할 때까지"],
  ["닉네임, 동네, 프로필 그림", "판매글·채팅에서 나를 보여 주기", "탈퇴할 때까지"],
  ["판매글·사진·댓글·채팅·후기", "서비스 이용 기록 (내가 올린 내용)", "직접 지우거나 탈퇴할 때까지"],
  ["신고 내용", "규칙 위반 확인 (운영자만 열람)", "처리 후 1년 이내 정리"],
  ["위치(위도·경도)", "동네 인증 때 동네 이름 찾기 — 저장하지 않음", "저장 안 함 (동네 이름만 저장)"],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-soil-soft hover:text-skin">← 홈으로</Link>
      <article className="card-sack mt-3 px-5 py-6 sm:px-8">
        <h1 className="font-display text-3xl">개인정보처리방침 🔒</h1>
        <p className="mt-1 text-xs text-soil-soft">시행일: 2026년 11월 11일 · 개발 공부용 프로젝트의 방침이에요.</p>

        <h2 className="mt-6 font-display text-lg">모으는 정보와 쓰는 곳</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead>
              <tr className="border-b-2 border-soil">
                <th className="py-2 pr-3">항목</th>
                <th className="py-2 pr-3">쓰는 곳</th>
                <th className="py-2">보관 기간</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([a, b, c]) => (
                <tr key={a} className="border-b border-dashed border-straw">
                  <td className="py-2 pr-3">{a}</td>
                  <td className="py-2 pr-3">{b}</td>
                  <td className="py-2">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-6 font-display text-lg">맡기는 곳 (처리 위탁)</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>Supabase — 회원·글·사진 저장 (서버 위치: 서울)</li>
          <li>Vercel — 웹사이트 운영 (서울 지역에서 실행)</li>
          <li>OpenStreetMap Nominatim — 동네 인증 때 위치로 동네 이름 찾기 (좌표만 전달)</li>
        </ul>

        <h2 className="mt-6 font-display text-lg">내 정보 보호</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>채팅과 채팅 사진은 대화방의 두 사람만 볼 수 있어요. 운영자도 볼 수 없어요.</li>
          <li>누가 내 글에 ♡를 눌렀는지는 공개되지 않아요.</li>
          <li>탈퇴하면 내 정보와 올린 내용이 모두 지워져요.</li>
        </ul>
        <p className="mt-8 text-sm">
          서비스 규칙은 <Link href="/terms" className="underline underline-offset-2 hover:text-skin">이용약관</Link>에서 볼 수 있어요.
        </p>
      </article>
    </div>
  );
}
