import { useEffect, useState, type ReactNode } from 'react';

/** 설계 기준 논리 크기 (가로 폰 844×390) */
export const LOGICAL_W = 844;
export const LOGICAL_H = 390;

export interface ViewSize {
  /** 논리 좌표의 화면 크기 (가로 844 고정, 세로는 화면 비율에 따라 늘어남 = 지도 영역만 늘어남) */
  w: number;
  h: number;
  /** 논리 1pt 당 실제 CSS px */
  scale: number;
}

function measure(): ViewSize {
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  // 같은 배치를 키워서 보여 준다: 가로·세로 중 작은 배율. 남는 쪽은 논리 크기를 늘려 지도에 준다
  const scale = Math.min(iw / LOGICAL_W, ih / LOGICAL_H);
  return { w: iw / scale, h: ih / scale, scale };
}

let current: ViewSize = typeof window === 'undefined' ? { w: LOGICAL_W, h: LOGICAL_H, scale: 1 } : measure();
const listeners = new Set<(v: ViewSize) => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    current = measure();
    listeners.forEach((l) => l(current));
  });
}

export function useViewSize(): ViewSize {
  const [v, setV] = useState(current);
  useEffect(() => {
    listeners.add(setV);
    return () => void listeners.delete(setV);
  }, []);
  return v;
}

/**
 * 모든 화면을 논리 크기(844×?)로 그리고 실제 창에 맞게 확대한다.
 * PC 1280×800 창 → 배율 1.517, 논리 844×527 (세로 여유는 지도·전장 영역이 받는다).
 */
export function Viewport({ children }: { children: ReactNode }) {
  const v = useViewSize();
  return (
    <div className="viewport" style={{ width: v.w, height: v.h, transform: `scale(${v.scale})` }}>
      {children}
    </div>
  );
}

/** 실제 마우스·터치 좌표 → 논리 좌표 */
export function toLogical(clientX: number, clientY: number): { x: number; y: number } {
  return { x: clientX / current.scale, y: clientY / current.scale };
}
