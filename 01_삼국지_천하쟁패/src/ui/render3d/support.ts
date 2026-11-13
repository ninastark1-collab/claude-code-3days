import { guessQuality, type Quality } from '../../render3d/quality';

/** 3D 화면을 쓸 수 있는가 (WebGL2). 안 되면 예전 2D 화면으로 그린다. 주소에 ?2d 를 붙이면 2D 강제 */
export const CAN_3D = (() => {
  try {
    if (typeof location !== 'undefined' && /[?&]2d\b/.test(location.search)) return false;
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
})();

/** 화질 단계: 설정에서 고른 값이 있으면 그것, 없으면 기기를 보고 자동 */
let chosen: Quality | null = null;
export function quality3D(): Quality {
  if (chosen) return chosen;
  try {
    const v = localStorage.getItem('samgukji.quality3d') ?? localStorage.getItem('samgukji.quality3d.auto');
    if (v === 'high' || v === 'normal' || v === 'saver') return (chosen = v);
  } catch {
    /* 저장소 없음 */
  }
  return (chosen = guessQuality());
}
/** 설정 화면 표시용: 사용자가 고른 값 (없으면 자동) */
export function quality3DSetting(): Quality | 'auto' {
  try {
    const v = localStorage.getItem('samgukji.quality3d');
    return v === 'high' || v === 'normal' || v === 'saver' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * 자동일 때만: 장면을 연 뒤 4초 동안 잰 fps 가 목표보다 낮으면 한 단계 내리고 기억한다 (설계서 "폰 성능 단계").
 * 고급 → 보통 (50fps 미만), 보통 → 절약 (40fps 미만). 절약은 30fps 고정이라 더 내리지 않는다.
 */
export function reportFps(fps: number): Quality | null {
  if (quality3DSetting() !== 'auto') return null;
  const q = quality3D();
  const next: Quality | null = q === 'high' && fps < 50 ? 'normal' : q === 'normal' && fps < 40 ? 'saver' : null;
  if (!next) return null;
  chosen = next;
  try {
    localStorage.setItem('samgukji.quality3d.auto', next);
  } catch {
    /* 저장소 없음 */
  }
  return next;
}

export function setQuality3D(q: Quality | 'auto'): void {
  try {
    localStorage.removeItem('samgukji.quality3d.auto');
    if (q === 'auto') localStorage.removeItem('samgukji.quality3d');
    else localStorage.setItem('samgukji.quality3d', q);
  } catch {
    /* 저장소 없음 */
  }
  chosen = q === 'auto' ? guessQuality() : q;
}
