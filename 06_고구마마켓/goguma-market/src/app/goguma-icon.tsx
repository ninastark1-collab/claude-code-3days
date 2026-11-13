// 앱 아이콘 그림 (홈 화면·탭·애플 기기 아이콘에서 같이 써요)
// ImageResponse는 HTML/CSS 모양을 PNG 그림으로 바꿔 줘요. 그래서 고구마를 동그라미 몇 개로 그렸어요.
export function GogumaIconArt({ size }: { size: number }) {
  const u = size / 100; // 100칸 기준으로 비율 맞추기
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f6eedd", // 한지
        borderRadius: 22 * u,
      }}
    >
      {/* 고구마 몸통 (껍질 자주색) */}
      <div
        style={{
          width: 74 * u,
          height: 50 * u,
          background: "#8c3b5e",
          borderRadius: "50%",
          border: `${4 * u}px solid #4a2f22`,
          transform: "rotate(-20deg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 14 * u,
        }}
      >
        {/* 눈 두 개 */}
        <div style={{ width: 7 * u, height: 9 * u, background: "#4a2f22", borderRadius: "50%" }} />
        <div style={{ width: 7 * u, height: 9 * u, background: "#4a2f22", borderRadius: "50%" }} />
      </div>
    </div>
  );
}
