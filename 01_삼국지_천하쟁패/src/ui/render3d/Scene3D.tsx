import { useEffect, useRef, useState } from 'react';
import { attachInput, type InputHandlers } from '../../render3d/camera';
import type { Quality } from '../../render3d/quality';
import { World3D, type FrameStats, type Stage } from '../../render3d/world';
import { useViewSize } from '../viewport';
import { reportFps } from './support';

/**
 * 3D 캔버스 하나를 화면 전체(논리 크기)에 깔고 World3D 를 붙인다. HUD는 이 위에 React로 겹친다.
 * - paused 면 그리지 않는다 (전투 일시정지, 다른 화면 위에 덮였을 때)
 * - 첫 화면이 그려질 때까지 "펼치는 중…" (S31), 4초 뒤 실측 fps 로 화질 자동 조정 (자동일 때만)
 * - season: 가을 단풍·눈 (S35)
 */
export function Scene3D(props: {
  makeStage: () => Stage;
  quality: Quality;
  paused?: boolean;
  onReady?: (w: World3D) => void;
  onStats?: (s: FrameStats) => void;
  input?: InputHandlers;
  className?: string;
  season?: { autumn: number; snow: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const world = useRef<World3D | null>(null);
  const view = useViewSize();
  const [loading, setLoading] = useState(true);
  const onStats = useRef(props.onStats);
  onStats.current = props.onStats;

  useEffect(() => {
    const cv = ref.current!;
    const w = new World3D(cv, props.quality);
    world.current = w;
    w.resize(view.w, view.h, view.scale);
    w.setStage(props.makeStage());
    if (props.season) w.season = { ...props.season };
    const detach = attachInput(cv, () => w.cam, () => w.logicalH, props.input);
    const poke = () => w.poke();
    cv.addEventListener('pointerdown', poke);
    cv.addEventListener('pointermove', poke);
    cv.addEventListener('wheel', poke);
    let measured = false;
    const t0 = performance.now();
    w.onStats = (s) => {
      setLoading(false);
      if (!measured && performance.now() - t0 > 4000) {
        measured = true;
        const next = reportFps(s.fps);
        if (next) w.setQuality(next);
      }
      onStats.current?.(s);
    };
    w.start();
    const lt = setTimeout(() => setLoading(false), 1500);
    // 개발 모드에서만: 캡처·측정 스크립트용 핸들
    if (import.meta.env.DEV) (window as unknown as { __world: World3D }).__world = w;
    props.onReady?.(w);
    return () => {
      clearTimeout(lt);
      cv.removeEventListener('pointerdown', poke);
      cv.removeEventListener('pointermove', poke);
      cv.removeEventListener('wheel', poke);
      detach();
      w.dispose();
      world.current = null;
    };
    // 장면은 처음 한 번만 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => world.current?.resize(view.w, view.h, view.scale), [view.w, view.h, view.scale]);
  useEffect(() => world.current?.setQuality(props.quality), [props.quality]);
  useEffect(() => world.current?.setPaused(!!props.paused), [props.paused]);
  useEffect(() => {
    if (world.current && props.season) world.current.season = { ...props.season };
  }, [props.season?.autumn, props.season?.snow]);

  return (
    <>
      <canvas ref={ref} className={`scene3d ${props.className ?? ''}`} style={{ width: view.w, height: view.h }} />
      {loading && <div className="loading3d">펼치는 중…</div>}
    </>
  );
}

/** 달 → 계절 값 (S35): 가을(9~11월) 단풍, 겨울(12~2월) 눈 */
export function seasonOf(month: number): { autumn: number; snow: number } {
  if (month >= 9 && month <= 11) return { autumn: 1, snow: 0 };
  if (month === 12 || month <= 2) return { autumn: 0.3, snow: 1 };
  return { autumn: 0, snow: 0 };
}
