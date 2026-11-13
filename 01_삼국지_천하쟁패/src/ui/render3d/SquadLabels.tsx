import { useEffect, useRef } from 'react';
import type { BattleState, Side } from '../../engine/battle/types';
import type { BattleStage } from '../../render3d/stages/battle';
import { fmt } from '../common';
import { factionColor, inkOn, sealChar } from '../theme';
import { useViewSize } from '../viewport';

/**
 * 3D 전장 위 부대 표시: 장수 인장 + 이름 + 남은 병력 + 막대 (시안 .lbl).
 * React 다시 그리기 없이 매 프레임 위치·숫자만 DOM에 직접 쓴다.
 */
export function SquadLabels({ b, stage, mine, sel, commanders }: { b: BattleState; stage: () => BattleStage | null; mine: Side; sel: string | null; commanders: Set<string> }) {
  const view = useViewSize();
  const els = useRef(new Map<string, HTMLDivElement>());
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    // 병력이 줄면 숫자가 붉게 깜빡이고, 0.7초마다 줄어든 만큼 -숫자가 뜬다 (시안 규칙)
    const last = new Map(b.units.map((u) => [u.id, u.troops]));
    const pending = new Map<string, number>();
    let pendT = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const st = stage();
      if (!st?.sim) return;
      const now = performance.now();
      const flush = now - pendT > 700;
      if (flush) pendT = now;
      // 겹치면 위로 비켜 선다 (화면 아래쪽 = 가까운 부대부터 자리를 잡는다)
      const placed: { x: number; y: number; w: number }[] = [];
      const list = st.labels(view.w, view.h).sort((p, q) => q.y - p.y);
      for (const l of list) {
        const el = els.current.get(l.id);
        if (!el) continue;
        const u = b.units.find((x) => x.id === l.id);
        if (!u || !l.ok) {
          el.style.display = 'none';
          continue;
        }
        el.style.display = '';
        const w = el.offsetWidth || 90;
        const H = 24;
        let y = l.y;
        for (let k = 0; k < 6; k++) {
          const hit = placed.some((r) => Math.abs(r.x - l.x) < (r.w + w) / 2 && Math.abs(r.y - y) < H);
          if (!hit) break;
          y -= H;
        }
        placed.push({ x: l.x, y, w });
        el.style.transform = `translate(${l.x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
        const num = el.querySelector('em')!;
        const t = fmt(u.troops);
        if (num.textContent !== t) num.textContent = t;
        const prev = last.get(u.id) ?? u.troops;
        if (u.troops < prev) {
          pending.set(u.id, (pending.get(u.id) ?? 0) + prev - u.troops);
          el.classList.remove('hit');
          void el.offsetWidth;
          el.classList.add('hit');
        }
        last.set(u.id, u.troops);
        if (flush && pending.get(u.id) && layer.current) {
          const f = document.createElement('div');
          f.className = `ft3d ${u.side === mine ? 'ours' : ''}`;
          f.textContent = '-' + fmt(pending.get(u.id)!);
          f.style.transform = `translate(${(l.x + 34).toFixed(0)}px, ${(y - 30).toFixed(0)}px)`;
          layer.current.appendChild(f);
          setTimeout(() => f.remove(), 1150);
          pending.set(u.id, 0);
        }
        (el.querySelector('s') as HTMLElement).style.width = `${Math.round((100 * u.troops) / Math.max(1, u.startTroops))}%`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [b, stage, view.w, view.h, mine]);
  return (
    <div className="lbl3d-layer" aria-hidden ref={layer}>
      {b.units.map((u) => {
        const col = factionColor(u.faction);
        return (
          <div
            key={u.id}
            ref={(el) => void (el ? els.current.set(u.id, el) : els.current.delete(u.id))}
            className={`lbl3d ${u.side === mine ? 'mine' : 'foe'} ${sel === u.id ? 'sel' : ''} ${commanders.has(u.id) ? 'cmd' : ''}`}
            style={{ display: 'none' }}
          >
            <b style={{ background: col, color: inkOn(col) }}>{sealChar(u.officer, u.name)}</b>
            <div>
              <span>
                {commanders.has(u.id) ? '帥 ' : ''}
                {u.name}
                <em />
              </span>
              <i>
                <s />
              </i>
            </div>
          </div>
        );
      })}
    </div>
  );
}
