import { useEffect, useRef } from 'react';
import { MapStage } from '../../render3d/stages/map';
import { CITY_LONLAT, LAND, MOUNTS, RIVERS } from '../map/geo';
import type { MapProps } from '../map/MapCanvas';
import { factionColor, inkOn } from '../theme';
import { useViewSize } from '../viewport';
import { Scene3D, seasonOf } from './Scene3D';
import { quality3D } from './support';

/**
 * 천하 지도 3D. 2D MapCanvas 와 같은 props 를 받는다 (전략 화면이 갈아 끼운다).
 * 도시 이름표는 DOM 으로 겹친다 (탭 = 도시 선택, 길게 누르기 = 미리보기).
 */
export function Map3D(p: MapProps & { names: Record<string, string>; paused?: boolean; month?: number }) {
  const view = useViewSize();
  const stage = useRef<MapStage | null>(null);
  const els = useRef(new Map<string, HTMLDivElement>());
  const props = useRef(p);
  props.current = p;

  useEffect(() => stage.current?.setCities(p.cities), [p.cities]);
  useEffect(() => stage.current?.setSelected(p.selected ?? null), [p.selected]);
  useEffect(() => stage.current?.setThreats(p.threats ?? []), [p.threats]);
  useEffect(() => {
    if (p.focus && stage.current) stage.current.focus(p.focus.city, (p.rightInset ?? 0) / view.w, true);
  }, [p.focus?.nonce, p.rightInset]);

  // 이름표 위치 (매 프레임)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const st = stage.current;
      if (!st) return;
      // 확대 단계 (S34): 천하(멀리) = 수도·내 도시만, 주(중간) = 모든 도시 이름, 도시(가까이) = 이름 + 병력
      const far = st.zoomDist > 150;
      const near = st.zoomDist < 80;
      for (const l of st.labels(view.w, view.h)) {
        const el = els.current.get(l.id);
        if (!el) continue;
        const c = props.current.cities.find((x) => x.id === l.id);
        const show = l.ok && (!far || !!c?.capital || !!c?.seal || props.current.selected === l.id);
        el.style.display = show ? '' : 'none';
        el.classList.toggle('near', near);
        if (l.ok) el.style.transform = `translate(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px) translate(-50%, -100%)`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [view.w, view.h]);

  return (
    <>
      <Scene3D
        makeStage={() => {
          const s = new MapStage({ land: LAND, rivers: RIVERS, mounts: MOUNTS, cityLonLat: CITY_LONLAT }, p.cities, p.roads, factionColor);
          stage.current = s;
          return s;
        }}
        quality={quality3D()}
        paused={p.paused}
        season={seasonOf(p.month ?? 3)}
        onReady={() => {
          const st = stage.current!;
          st.setSelected(props.current.selected ?? null);
          st.setThreats(props.current.threats ?? []);
          if (props.current.focus) st.focus(props.current.focus.city, (props.current.rightInset ?? 0) / view.w, true);
        }}
        input={{
          onTap: (ndc) => props.current.onSelect?.(stage.current?.pick(ndc) ?? null),
          onLongPress: (ndc) => {
            const id = stage.current?.pick(ndc) ?? null;
            const l = id ? stage.current!.labels(view.w, view.h).find((x) => x.id === id) : null;
            props.current.onPeek?.(id, l ? { x: l.x, y: l.y } : undefined);
          },
        }}
      />
      <div className="lbl3d-layer" aria-hidden>
        {p.cities.map((c) => {
          const col = factionColor(c.faction);
          return (
            <div key={c.id} ref={(el) => void (el ? els.current.set(c.id, el) : els.current.delete(c.id))} className={`city3d ${p.selected === c.id ? 'sel' : ''}`} style={{ display: 'none' }}>
              {c.seal && <b style={{ background: col, color: inkOn(col) }}>{c.seal}</b>}
              <span>{p.names[c.id] ?? c.name}</span>
              {c.troops != null && <em>{Math.round(c.troops / 1000)}천</em>}
            </div>
          );
        })}
      </div>
      {p.children}
    </>
  );
}
