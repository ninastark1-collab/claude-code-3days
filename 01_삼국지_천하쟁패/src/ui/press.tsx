import { useRef, useState, type ReactNode } from 'react';

/** 길게 누르기 판정 시간 (디자인: 0.35초) */
export const LONG_PRESS_MS = 350;

/**
 * 누름 / 길게 누름을 구분한다. 마우스·터치 모두 포인터 이벤트로 처리.
 * 길게 누르면 onLong 이 불리고, 그 뒤 손을 떼도 onPress 는 불리지 않는다.
 */
export function usePress(opts: { onPress?: () => void; onLong?: () => void; onRelease?: () => void }) {
  const timer = useRef<number | null>(null);
  const longFired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      longFired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      if (opts.onLong)
        timer.current = window.setTimeout(() => {
          longFired.current = true;
          opts.onLong?.();
        }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent) => {
      // 손가락이 많이 움직이면(드래그) 길게 누르기 취소
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear();
    },
    onPointerUp: () => {
      clear();
      if (longFired.current) opts.onRelease?.();
      else opts.onPress?.();
      start.current = null;
    },
    onPointerLeave: () => {
      clear();
      if (longFired.current) opts.onRelease?.();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

/**
 * 툴팁: 마우스를 올리면(PC) 또는 길게 누르면(폰) 보인다. 손을 떼거나 마우스가 나가면 닫힌다.
 */
export function Tip({ tip, children, className, place = 'top' }: { tip: ReactNode; children: ReactNode; className?: string; place?: 'top' | 'bottom' }) {
  const [open, setOpen] = useState(false);
  const press = usePress({ onLong: () => setOpen(true), onRelease: () => setOpen(false) });
  return (
    <span
      className={`tip-host ${className ?? ''}`}
      onMouseEnter={(e) => {
        if ((e.nativeEvent as PointerEvent).pointerType !== 'touch') setOpen(true);
      }}
      onMouseLeave={() => setOpen(false)}
      {...press}
    >
      {children}
      {open && <span className={`tip ${place}`}>{tip}</span>}
    </span>
  );
}
