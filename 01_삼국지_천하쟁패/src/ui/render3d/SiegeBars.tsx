import { useEffect, useRef, useState } from 'react';
import type { BattleStage } from '../../render3d/stages/battle';
import { useViewSize } from '../viewport';

/** 성문·성벽 내구도 막대 (엔진 값). 성문은 늘 보이고, 성벽은 공격받는 칸만 */
export function SiegeBars({ stage }: { stage: () => BattleStage | null }) {
  const view = useViewSize();
  const layer = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<number, HTMLDivElement>());
  const [, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const st = stage();
      if (!st?.sim || !layer.current) return;
      const seen = new Set<number>();
      for (const b of st.siegeBars(view.w, view.h)) {
        seen.add(b.key);
        let el = els.current.get(b.key);
        if (!el) {
          el = document.createElement('div');
          el.className = `siege3d ${b.gate ? 'gate' : 'wall'}`;
          el.innerHTML = `<b>${b.gate ? '城門' : '城壁'}</b><i><s></s></i><em></em>`;
          layer.current.appendChild(el);
          els.current.set(b.key, el);
          setN((n) => n + 1);
        }
        el.style.display = b.ok ? '' : 'none';
        el.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px) translate(-50%, -100%)`;
        (el.querySelector('s') as HTMLElement).style.width = `${Math.round(b.ratio * 100)}%`;
        el.classList.toggle('low', b.ratio < 0.3);
        el.classList.toggle('broken', b.ratio <= 0);
        const t = b.ratio <= 0 ? '뚫림' : `${Math.round(b.ratio * 100)}%`;
        const em = el.querySelector('em')!;
        if (em.textContent !== t) em.textContent = t;
      }
      for (const [k, el] of els.current) if (!seen.has(k)) el.style.display = 'none';
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stage, view.w, view.h]);
  return <div className="lbl3d-layer" ref={layer} aria-hidden />;
}
