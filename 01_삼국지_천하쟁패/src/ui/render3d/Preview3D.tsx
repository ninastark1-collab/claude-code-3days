import { useState } from 'react';
import { TIME_NAME, type TimeOfDay } from '../../render3d/env';
import { BUDGET, guessQuality, QUALITY_NAME, type Quality } from '../../render3d/quality';
import { FieldStage } from '../../render3d/stages/field';
import type { FrameStats, World3D } from '../../render3d/world';
import { useStore } from '../store';
import { Scene3D } from './Scene3D';

/**
 * 3D 1단계 확인 화면: 빈 평원 장면 + 시간대·화질 바꾸기 + 그리기 통계.
 * 들어가는 길: 개발 콘솔 __store.getState().go('scene3d') 또는 주소 끝 #scene3d
 */
export default function Preview3D() {
  const go = useStore((s) => s.go);
  const [world, setWorld] = useState<World3D | null>(null);
  const [time, setTime] = useState<TimeOfDay>('day');
  const [rain, setRain] = useState(false);
  const [quality, setQuality] = useState<Quality>(() => guessQuality());
  const [stats, setStats] = useState<FrameStats | null>(null);
  const pick = (t: TimeOfDay, r = rain) => {
    setTime(t);
    setRain(r);
    world?.setTime(t, r);
  };
  return (
    <div className="screen">
      <Scene3D
        makeStage={() => new FieldStage()}
        quality={quality}
        onStats={setStats}
        onReady={(w) => {
          setWorld(w);
          // 개발 모드에서만: 캡처·측정 스크립트용 핸들
          if (import.meta.env.DEV) (window as unknown as { __world: World3D }).__world = w;
        }}
      />
      <div className="abs glass3d hud3d-top" style={{ left: 'var(--sa)', top: 10 }}>
        <b className="disp">3D 장면 확인</b>
        <span className="dim micro">끌기 = 이동 · 두 손가락/휠 = 확대</span>
      </div>
      <div className="abs glass3d hud3d-ctl" style={{ right: 'var(--sa)', top: 10 }}>
        <div className="seg3d" role="group" aria-label="시간대">
          {(['day', 'dusk', 'night'] as TimeOfDay[]).map((t) => (
            <button key={t} className={time === t ? 'on' : ''} onClick={() => pick(t)}>
              {TIME_NAME[t]}
            </button>
          ))}
          <button className={rain ? 'on' : ''} onClick={() => pick(time, !rain)}>
            비
          </button>
        </div>
        <div className="seg3d" role="group" aria-label="화질">
          {(['high', 'normal', 'saver'] as Quality[]).map((q) => (
            <button key={q} className={quality === q ? 'on' : ''} onClick={() => setQuality(q)}>
              {QUALITY_NAME[q]}
            </button>
          ))}
        </div>
      </div>
      {stats && (
        <div className="abs glass3d hud3d-stats num micro" style={{ left: 'var(--sa)', bottom: 12 }}>
          {stats.fps} fps · 그리기 {stats.calls}/{BUDGET.drawCalls} · 삼각형 {Math.round(stats.triangles / 1000)}k/{BUDGET.triangles / 1000}k · 배율 {stats.pixelRatio.toFixed(2)}
        </div>
      )}
      <div className="abs" style={{ right: 'var(--sa)', bottom: 12 }}>
        <button className="glass3d hud3d-btn" onClick={() => go('title')}>
          돌아가기
        </button>
      </div>
    </div>
  );
}
