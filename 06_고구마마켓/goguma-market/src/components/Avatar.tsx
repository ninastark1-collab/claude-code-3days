import { tempLook } from "@/lib/market";

// 프로필 이모지 동그라미 (사람마다 고른 이모지가 보여요)
export function Avatar({ emoji, size = 44 }: { emoji?: string | null; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border-2 border-soil bg-flesh-soft"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      aria-hidden
    >
      {emoji || "🍠"}
    </span>
  );
}

// 고구마 온도 (거래 후기로 오르내려요). compact면 숫자만 작게
export function TempBadge({ temp, compact }: { temp: number; compact?: boolean }) {
  const look = tempLook(temp);
  if (compact)
    return (
      <span className="font-display text-sm" style={{ color: look.color }}>
        {temp.toFixed(1)}℃ {look.emoji}
      </span>
    );
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-display">고구마 온도</span>
        <span className="font-display" style={{ color: look.color }}>
          {temp.toFixed(1)}℃ {look.emoji}
        </span>
      </div>
      <div className="mt-1.5 h-3 overflow-hidden rounded-full border-2 border-soil bg-hanji-deep">
        <div className="h-full" style={{ width: `${Math.min(100, temp)}%`, background: look.color }} />
      </div>
    </div>
  );
}
