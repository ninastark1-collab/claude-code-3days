import { useEffect, useRef } from 'react';
import { tokenValue } from '../theme';
import { useViewSize } from '../viewport';

function rnd(s: number): number {
  const t = Math.sin(s * 127.1) * 43758.5453;
  return t - Math.floor(t);
}

/** 먹 번짐 배경 (타이틀·이벤트·일기토) — design/mobile-screens.html 의 drawInk */
export function InkCanvas({ seed, split }: { seed: number; split?: [string, string] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const v = useViewSize();
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = v.w;
    const H = v.h;
    cv.width = Math.round(W * v.scale * dpr);
    cv.height = Math.round(H * v.scale * dpr);
    const x = cv.getContext('2d')!;
    x.setTransform(v.scale * dpr, 0, 0, v.scale * dpr, 0, 0);
    x.fillStyle = tokenValue('--g-lacquer-solid');
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const cx = rnd(i * 5 + seed) * W;
      const cy = H * (0.45 + rnd(i * 7 + seed) * 0.6);
      const rr = 40 + rnd(i * 11) * 160;
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gr.addColorStop(0, `rgba(216,214,193,${0.05 + rnd(i) * 0.06})`);
      gr.addColorStop(1, 'rgba(216,214,193,0)');
      x.fillStyle = gr;
      x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    }
    x.strokeStyle = 'rgba(216,214,193,.18)';
    x.lineWidth = 1.2;
    for (let m = 0; m < 3; m++) {
      x.beginPath();
      for (let X = 0; X <= W; X += 12) x.lineTo(X, H * (0.42 + m * 0.1) - Math.abs(Math.sin(X * 0.006 + m * 2)) * (90 - m * 25) - Math.sin(X * 0.03 + m) * 6);
      x.stroke();
    }
    if (split) {
      x.globalAlpha = 0.55;
      x.fillStyle = split[0];
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(W * 0.58, 0);
      x.lineTo(W * 0.42, H);
      x.lineTo(0, H);
      x.closePath();
      x.fill();
      x.fillStyle = split[1];
      x.beginPath();
      x.moveTo(W * 0.58, 0);
      x.lineTo(W, 0);
      x.lineTo(W, H);
      x.lineTo(W * 0.42, H);
      x.closePath();
      x.fill();
      x.globalAlpha = 1;
      x.strokeStyle = tokenValue('--g-text');
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(W * 0.58, 0);
      x.lineTo(W * 0.42, H);
      x.stroke();
    }
  }, [seed, split?.[0], split?.[1], v.w, v.h, v.scale]);
  return <canvas ref={ref} className="ink-bg" aria-hidden="true" />;
}
