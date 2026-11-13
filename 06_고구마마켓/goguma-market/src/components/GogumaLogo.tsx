// 귀여운 고구마 캐릭터 (SVG)
// - 기본: 통통한 통고구마 + 웃는 얼굴 (헤더 로고용)
// - steaming: 한쪽을 쪼개 노란 속살이 보이는 군고구마 + 반짝반짝
//
// 고구마다운 모양(양 끝이 가늘고 꼬리가 달린 몸통)은 살리고,
// 통통한 비율 · 밝은 분홍빛 자주색 · 볼터치 얼굴로 귀엽게 그렸어요.

const OUTLINE = "#4a2f22";

export default function GogumaLogo({ size = 40, steaming = false }: { size?: number; steaming?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="gm-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9709a" />
          <stop offset="0.6" stopColor="#b44d7b" />
          <stop offset="1" stopColor="#923a63" />
        </linearGradient>
        <radialGradient id="gm-flesh" cx="0.45" cy="0.45" r="0.65">
          <stop offset="0" stopColor="#ffbe4d" />
          <stop offset="1" stopColor="#ffe08f" />
        </radialGradient>
        <clipPath id="gm-broken">
          <rect x="0" y="0" width="76" height="100" />
        </clipPath>
      </defs>

      {/* 반짝반짝 (갓 구운 느낌) */}
      {steaming && (
        <g fill="#f2a93b" stroke={OUTLINE} strokeWidth="1.2" strokeLinejoin="round">
          <path className="animate-twinkle" d="M80 14l2.2 5.3 5.3 2.2-5.3 2.2L80 29l-2.2-5.3-5.3-2.2 5.3-2.2z" />
          <path
            className="animate-twinkle"
            style={{ animationDelay: "0.7s" }}
            d="M64 22l1.4 3.3 3.3 1.4-3.3 1.4L64 31.4l-1.4-3.3-3.3-1.4 3.3-1.4z"
          />
          <path
            className="animate-twinkle"
            style={{ animationDelay: "1.4s" }}
            fill="#ffb3c7"
            d="M90 32c0-2.2 3-2.2 3 0 0-2.2 3-2.2 3 0 0 2-3 3.6-3 4.6 0-1-3-2.6-3-4.6z"
          />
        </g>
      )}

      {/* 바닥 그림자 */}
      <ellipse cx="50" cy="83" rx="32" ry="4" fill={OUTLINE} opacity="0.1" />

      <g transform="rotate(-12 50 56)">
        {/* 꼬리 (잔뿌리): 동그랗게 말린 모양 */}
        <path d="M12 58c-4 0-7 2-7 5s3 4 5 2" stroke={OUTLINE} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        {/* 꼭지 (통고구마일 때만) */}
        {!steaming && (
          <path d="M89 50c2-1 4-3 5-6" stroke={OUTLINE} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        )}

        <g clipPath={steaming ? "url(#gm-broken)" : undefined}>
          {/* 통통한 몸통 */}
          <path
            d="M11 58
               C 14 42, 30 33, 50 33
               C 70 33, 85 40, 90 51
               C 86 66, 70 75, 50 75
               C 30 75, 13 70, 11 58 Z"
            fill="url(#gm-skin)"
            stroke={OUTLINE}
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
          {/* 은은한 껍질 결 (두 줄만, 연하게) */}
          <g stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.18">
            <path d="M24 44c2 6 2 14 0 22" />
            <path d="M74 41c2 6 2 14 0 24" />
          </g>
          {/* 윗면 반짝 */}
          <path d="M30 41c6-3 14-4 20-3" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.55" />
          <circle cx="56" cy="38.5" r="1.6" fill="#fff" opacity="0.55" />
        </g>

        {/* 쪼갠 단면 (군고구마) */}
        {steaming && (
          <path
            d="M76 37
               c 5 2, 9 6, 8 10
               c 2 2, 2 6, 0 8
               c 1 3, -1 7, -3 8
               c -1 3, -3 5, -5 6
               c -4 -4, -6 -10, -6 -16
               s 2 -12, 6 -16 Z"
            fill="url(#gm-flesh)"
            stroke={OUTLINE}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        )}

        {/* 얼굴 */}
        <g transform={steaming ? "translate(-4 0)" : undefined}>
          {/* 눈 */}
          <ellipse cx="42" cy="55" rx="3" ry="3.6" fill={OUTLINE} />
          <ellipse cx="60" cy="55" rx="3" ry="3.6" fill={OUTLINE} />
          <circle cx="43.1" cy="53.6" r="1.1" fill="#fff" />
          <circle cx="61.1" cy="53.6" r="1.1" fill="#fff" />
          {/* 볼터치 */}
          <ellipse cx="35" cy="62" rx="4.5" ry="2.6" fill="#ff9fb8" opacity="0.85" />
          <ellipse cx="67" cy="62" rx="4.5" ry="2.6" fill="#ff9fb8" opacity="0.85" />
          {/* 입 */}
          <path d="M47.5 60.5c1.5 2.4 5.5 2.4 7 0" stroke={OUTLINE} strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      </g>
    </svg>
  );
}
