/**
 * 폰 성능 단계 (battle-3d.html "폰 성능 단계" 표)
 * | 단계 | 해상도 | 그림자 | 후처리 | 병사 | 목표 |
 * | 고급 | 기기 배율 최대 2.25 | 2048 | 블룸 + 틸트시프트 | 250 | 60fps |
 * | 보통 | 1.5 | 1024 | 블룸 | 180 | 60fps |
 * | 절약 | 1.0 | 1024 | 없음 | 120 | 30fps |
 */
export type Quality = 'high' | 'normal' | 'saver';

export interface QualitySpec {
  maxPixelRatio: number;
  shadowMap: number;
  bloom: boolean;
  tilt: boolean;
  soldiers: number;
  fps: number;
}

export const QUALITY: Record<Quality, QualitySpec> = {
  high: { maxPixelRatio: 2.25, shadowMap: 2048, bloom: true, tilt: true, soldiers: 250, fps: 60 },
  normal: { maxPixelRatio: 1.5, shadowMap: 1024, bloom: true, tilt: false, soldiers: 180, fps: 60 },
  saver: { maxPixelRatio: 1.0, shadowMap: 1024, bloom: false, tilt: false, soldiers: 120, fps: 30 },
};
export const QUALITY_NAME: Record<Quality, string> = { high: '고급', normal: '보통', saver: '절약' };

/**
 * 폰 그리기 예산 (전달서 5장). 보통·절약 단계는 이 안에 들어와야 한다.
 * 고급 단계는 병사 그림자 때문에 넘을 수 있다 (2026-11-13 사용자 결정: 허용, 실제 폰에서 60fps가 안 나오면 고급도 병사 그림자를 끈다)
 */
export const BUDGET = { drawCalls: 150, triangles: 300_000, textureMB: 64 };

/**
 * 첫 실행 때 기기를 보고 단계를 고른다 (7단계에서 실측 fps로 보정 예정).
 * 지금은 화면 크기·코어 수·GPU 이름만 본다.
 */
export function guessQuality(): Quality {
  if (typeof navigator === 'undefined') return 'normal';
  // 주소에 ?q=high|normal|saver 를 붙이면 강제 (측정·확인용)
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('q') : null;
  if (forced === 'high' || forced === 'normal' || forced === 'saver') return forced;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch {
    /* 무시 */
  }
  if (/SwiftShader|llvmpipe|Software/i.test(gpu)) return 'saver';
  if (mobile) return cores >= 8 && /Adreno \(TM\) [67]\d\d|Apple GPU|Mali-G7[1-9]|Immortalis/i.test(gpu) ? 'normal' : 'saver';
  return cores >= 8 ? 'high' : 'normal';
}
