import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "사진 출처 · 고구마마켓" };

// 예시 판매글에 쓴 참고 사진의 출처 목록
// 위키미디어 공용의 CC BY / CC BY-SA 사진은 '작가와 라이선스를 밝혀야' 쓸 수 있어서, 이 페이지에 모아 적어요.
// (판매글 설명에는 적지 않고, 사이트 맨 아래 '사진 출처' 링크로 들어올 수 있게 했어요)
const CREDITS = [
  { item: "70년대 무쇠 드럼통 군고구마 화덕", file: "2010-12-28_barrel_with_sweet_potatoes_roasted_inside_at_Taipei.jpg", author: "Bernard McManus", license: "CC BY 2.0" },
  { item: "토종 자색 씨고구마 '보랏빛 꿀밤' 20알", file: "Camotes-morados-luis-figueroa.jpg", author: "Luis Figueroa", license: "CC BY-SA 4.0" },
  { item: "고구마 꼭 닮은 남한강 자연 수석", file: "Exhibition_Suiseki_and_Shangshi_Prague_2011_2246.jpg", author: "Karelj", license: "퍼블릭 도메인" },
  { item: "할머니가 손으로 엮은 볏짚 고구마 소쿠리", file: "Korea-Andong-Hahoe_Folk_Village-Straw_art-01.jpg", author: "Robert at Picasa", license: "CC BY 3.0" },
  { item: "80년대 군고구마 리어카", file: "Roasted_sweet_potatoes_and_chestnuts_hawkers_(Hong_Kong).jpg", author: "Mk2010", license: "CC BY-SA 4.0" },
  { item: "80년대 군고구마 리어카 (두 번째 사진)", file: "Roasted_Sweet_Potatoes_in_South_Korea.jpg", author: "Brücke-Osteuropa", license: "CC0" },
  { item: "여주 고구마 품평회 1등 기념 놋쇠 메달", file: "Medal,_commemorative_(AM_785648-1).jpg", author: "Auckland Museum", license: "CC BY 4.0" },
  { item: "1997년 미개봉 투명 삐삐 한정판", file: "Beeper_Motorola_Bravo_Express_-_CTC_Chile_-_1.jpg", author: "Jorgebarrios", license: "CC BY-SA 4.0" },
  { item: "수령 120년 소나무 분재", file: "Bonsai_of_pine_tree,_Gyeyang,_South_Korea,_29_August_2022.jpg", author: "배부른 아이", license: "CC BY 2.0 KR" },
  { item: "1960년대 손으로 그린 우리 고장 옛 지도 원본", file: "Daedongyeojido_(Gyujanggak)_06-04.jpg", author: "김정호 (대동여지도)", license: "퍼블릭 도메인" },
  { item: "1988 올림픽 성화 봉송 주자 운동복 + 참가 기념패", file: "Seoul_1988_Torch.JPG", author: "IVF", license: "퍼블릭 도메인" },
  { item: "2027년 8월 이집트 개기일식 관측 투어 동행권", file: "2024_Total_Solar_Eclipse_Corona.jpg", author: "Brucewaters", license: "CC BY 4.0" },
  { item: "사과 10kg 한박스", file: "Apples_in_boxes.jpg", author: "위키미디어 공용", license: "CC0" },
  { item: "엔비디아 H100 GPU", file: "NVIDIA_H100_(极客湾Geekerwan)_011.png", author: "极客湾 Geekerwan", license: "CC BY 3.0" },
  { item: "꿀고구마 10kg 상암 최고 꿀맛 보장", file: "Sweet_Potatos.jpg", author: "위키미디어 공용", license: "CC0" },
];

export default function CreditsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-soil-soft hover:text-skin">← 홈으로</Link>
      <div className="card-sack mt-3 px-5 py-6 sm:px-8">
        <h1 className="font-display text-3xl">사진 출처 📷</h1>
        <p className="mt-2 text-sm leading-relaxed text-soil-soft">
          예시 판매글의 사진은 위키미디어 공용(Wikimedia Commons)에서 자유롭게 쓸 수 있는 사진을 빌려 온 참고 사진이에요.
          실제 판매 물건의 사진이 아니에요.
        </p>
        <ul className="mt-6 divide-y-2 divide-dashed divide-straw">
          {CREDITS.map((c) => (
            <li key={c.file} className="py-3">
              <p className="font-display">{c.item}</p>
              <p className="mt-0.5 text-sm text-soil-soft">
                <a
                  href={`https://commons.wikimedia.org/wiki/File:${c.file}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-skin"
                >
                  원본 사진
                </a>
                {" · "}
                {c.author} · {c.license}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
